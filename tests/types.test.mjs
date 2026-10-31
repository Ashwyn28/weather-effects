import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tsc = `${root}node_modules/typescript/bin/tsc`;

const compile = (file) =>
  execFileSync(
    process.execPath,
    [
      tsc,
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'ES2022',
      '--moduleResolution',
      'bundler',
      '--lib',
      'ES2022,DOM,DOM.Iterable',
      `${root}tests/types/${file}`,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );

test('dist type-checks the README consumer example', () => {
  assert.ok(existsSync(`${root}dist/index.d.ts`), 'run npm run build first');
  assert.ok(existsSync(`${root}dist/advanced.d.ts`), 'run npm run build first');
  try {
    compile('consumer.ts');
  } catch (error) {
    assert.fail(`${error.stdout}${error.stderr}`);
  }
});

test('the main entry does not export createSimulation', () => {
  assert.throws(
    () => compile('main-excludes-advanced.ts'),
    (error) => /createSimulation/.test(error.stdout),
  );
});
