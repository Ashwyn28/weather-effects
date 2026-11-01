// Regenerates docs/assets/conditions/<id>.png: one demo screenshot per condition.
// Usage: npm run build && node scripts/conditions.mjs
// Set CHROME_PATH to use a specific Chromium/Chrome binary.
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CONDITIONS } from '../dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'docs/assets/conditions');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 340 } });
  await page.route('https://cdn.jsdelivr.net/**/three.module.js', async (route) => {
    const body = await readFile(join(root, 'node_modules/three/build/three.module.js'));
    await route.fulfill({ body, contentType: 'text/javascript' });
  });
  for (const id of CONDITIONS) {
    await page.goto(`http://127.0.0.1:${port}/demo.html?weather=${id}&night=0`);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(outDir, `${id}.png`), type: 'png' });
    console.log(`wrote ${id}`);
  }
} finally {
  await browser.close();
  server.close();
}
