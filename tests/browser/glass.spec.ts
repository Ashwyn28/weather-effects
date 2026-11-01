import { test, expect } from '@playwright/test';
import { collectErrors } from './helpers';

// Count pixels outside the painted patch that differ from the white page behind the pane.
function countNonBackdrop(page: import('@playwright/test').Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const x = (i / 4) % c.width,
        y = Math.floor(i / 4 / c.width);
      if (x >= 100 && x < 200 && y >= 100 && y < 200) continue; // the painted patch
      if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255) n++;
    }
    return n;
  }, png.toString('base64'));
}

test('glass droplets show drops inside the pane in rain', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/minimal.html');
  const supported = await page.evaluate(async () => {
    const { createGlassDroplets } = await import('/dist/index.js');
    document.body.style.background = '#fff';
    const canvas = document.createElement('canvas');
    canvas.id = 'pane';
    canvas.style.cssText = 'position:fixed;left:20px;top:200px;width:300px;height:300px;z-index:30';
    document.body.append(canvas);
    // Transparent background: only drops are drawn, so clear glass stays clear.
    const glass = createGlassDroplets({ canvas, pixelRatio: 1, reducedMotion: null });
    if (!glass) return false;
    glass.resize(300, 300);
    // A background that paints only a small patch; the rest of the pane stays transparent.
    glass.setBackground((ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#336';
      ctx.fillRect(100, 100, 100, 100);
    });
    glass.setWeather('rain', { night: false });
    (window as unknown as { glass: unknown }).glass = glass;
    return true;
  });
  expect(supported).toBe(true);
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { glass: { pause(): void } }).glass.pause());
  await page.waitForTimeout(200);
  const png = await page.locator('#pane').screenshot();
  expect(await countNonBackdrop(page, png)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
