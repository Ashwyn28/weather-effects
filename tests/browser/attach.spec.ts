import { test, expect } from '@playwright/test';
import { collectErrors } from './helpers';

test('attachWeather adds canvases and destroy() removes them', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/minimal.html');
  await expect(page.locator('canvas')).toHaveCount(2);
  await page.evaluate(async () => {
    const { attachWeather } =
      (await import('/dist/index.js')) as typeof import('../../src/index.js');
    // Attach a second instance to destroy deterministically.
    const w = attachWeather({ condition: 'snow' });
    (window as unknown as { second: { destroy(): void } }).second = w;
  });
  await expect(page.locator('canvas')).toHaveCount(4);
  await page.evaluate(() =>
    (window as unknown as { second: { destroy(): void } }).second.destroy(),
  );
  await expect(page.locator('canvas')).toHaveCount(2);
  expect(errors).toEqual([]);
});
