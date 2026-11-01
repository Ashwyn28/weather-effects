import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('npm pack contains only the intended files', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
  });
  const paths = JSON.parse(out)[0].files.map((f) => f.path);
  const allowed = ['README.md', 'LICENSE', 'CHANGELOG.md', 'package.json'];
  for (const p of allowed) assert.ok(paths.includes(p), `missing ${p}`);
  const extra = paths.filter((p) => !p.startsWith('dist/') && !allowed.includes(p));
  assert.deepEqual(extra, []);
  assert.ok(paths.includes('dist/index.js'));
  assert.ok(paths.includes('dist/advanced.js'));
});
