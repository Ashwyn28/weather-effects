import { test, expect } from '@playwright/test';
import { serveLocalThree } from './helpers';

const CONDITIONS = [
  'clear',
  'mainly-clear',
  'partly-cloudy',
  'overcast',
  'fog',
  'drizzle',
  'freezing-drizzle',
  'rain',
  'freezing-rain',
  'showers',
  'snow',
  'snow-showers',
  'thunderstorm',
  'hail',
  'wind',
];

for (const night of [false, true]) {
  for (const weather of CONDITIONS) {
    const time = night ? 'night' : 'day';
    test(`demo ${weather} ${time}`, async ({ page }) => {
      await serveLocalThree(page);
      await page.goto(`/demo.html?weather=${weather}&night=${night ? 1 : 0}&seed=1&t=4&paused=1`);
      await page.waitForSelector('html[data-ready="1"]');
      await expect(page).toHaveScreenshot(`${weather}-${time}.png`);
    });
  }
}
