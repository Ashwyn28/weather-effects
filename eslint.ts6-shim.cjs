// The build uses the native TypeScript 7 compiler, which has no JS API. typescript-eslint needs
// that API, so route its `require('typescript')` to the TypeScript 6 compatibility package.
// Must be imported before typescript-eslint.
const Module = require('node:module');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(
    this,
    request === 'typescript' || request.startsWith('typescript/')
      ? request.replace(/^typescript/, '@typescript/typescript6')
      : request,
    ...rest,
  );
};
