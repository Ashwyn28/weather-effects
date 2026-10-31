import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const dir = new URL('../dist/shaders/', import.meta.url);

test('every GLSL module has balanced braces', async () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const mod = await import(new URL(file, dir));
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== 'string') continue;
      const open = (value.match(/{/g) ?? []).length;
      const close = (value.match(/}/g) ?? []).length;
      assert.equal(open, close, `${file}:${name} has unbalanced braces`);
    }
  }
});
