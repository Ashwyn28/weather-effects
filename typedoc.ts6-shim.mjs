// typedoc needs the TypeScript JS API, which the native TypeScript 7 compiler lacks.
// Route its `import 'typescript'` to the TypeScript 6 compatibility package (see eslint.ts6-shim.cjs).
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export function resolve(specifier, context, next) {
  if (specifier === 'typescript' || specifier.startsWith('typescript/')) {
    specifier = specifier.replace(/^typescript/, '@typescript/typescript6');
  }
  return next(specifier, context);
}`),
);
