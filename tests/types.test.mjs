import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('dist/index.d.ts type-checks the README consumer example', () => {
  assert.ok(existsSync(`${root}dist/index.d.ts`), 'run npm run build first');
  const tsc = `${root}node_modules/typescript/bin/tsc`;
  try {
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
        `${root}tests/types/consumer.ts`,
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
  } catch (error) {
    assert.fail(`${error.stdout}${error.stderr}`);
  }
});
