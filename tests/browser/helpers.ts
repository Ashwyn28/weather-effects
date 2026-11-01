import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// The pages load Three.js from a CDN through an import map; serve the local copy instead.
export async function serveLocalThree(page: Page) {
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/three.module.js', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: await readFile('node_modules/three/build/three.module.js'),
    });
  });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/three.core.js', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: await readFile('node_modules/three/build/three.core.js'),
    });
  });
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
