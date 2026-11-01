import { test, expect, chromium } from '@playwright/test';
import { collectErrors, serveLocalThree } from './helpers';

test('canvas fallback renders precipitation when WebGL is unavailable', async ({ baseURL }) => {
  const browser = await chromium.launch({
    args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'],
  });
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 800, height: 600 } });
    await serveLocalThree(page);
    const errors = collectErrors(page);
    await page.goto('/demo.html?weather=rain&night=1&seed=1&t=4&paused=1');
    await page.waitForSelector('html[data-ready="1"]');
    const result = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas.weather, canvas[data-renderer]')!;
      const probe = document.createElement('canvas');
      probe.width = c.width;
      probe.height = c.height;
      const ctx = probe.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      return { renderer: c.dataset.renderer, lit };
    });
    expect(result.renderer).toBe('canvas');
    expect(result.lit).toBeGreaterThan(0);
    // The browser logs its own WebGL failure; the library must add no errors.
    expect(errors.filter((e) => !/webgl/i.test(e))).toEqual([]);
  } finally {
    await browser.close();
  }
});

test('drawing resumes after WebGL context loss and restore', async ({ page }) => {
  await serveLocalThree(page);
  const errors = collectErrors(page);
  await page.goto('/demo.html?weather=partly-cloudy&night=0&seed=1&t=4&paused=1');
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('canvas.sky')).toHaveAttribute('data-renderer', 'webgl2');
  const before = await page.screenshot();

  await page.evaluate(async () => {
    const c = document.querySelector<HTMLCanvasElement>('canvas.sky')!;
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    const ext = gl!.getExtension('WEBGL_lose_context')!;
    const lost = new Promise((r) => c.addEventListener('webglcontextlost', r, { once: true }));
    ext.loseContext();
    await lost;
    (window as unknown as { loseExt: WEBGL_lose_context }).loseExt = ext;
  });
  const during = await page.screenshot();
  expect(during.equals(before)).toBe(false);

  await page.evaluate(async () => {
    const c = document.querySelector<HTMLCanvasElement>('canvas.sky')!;
    const restored = new Promise((r) =>
      c.addEventListener('webglcontextrestored', r, { once: true }),
    );
    (window as unknown as { loseExt: WEBGL_lose_context }).loseExt.restoreContext();
    await restored;
    // Redraw the same deterministic frame as before the loss.
    (window as unknown as { effects: { seek(t: number): void } }).effects.seek(4);
  });
  await expect
    .poll(async () => (await page.screenshot()).equals(before), { timeout: 30_000 })
    .toBe(true);
  expect(errors).toEqual([]);
});
