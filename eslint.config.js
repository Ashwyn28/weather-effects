import './eslint.ts6-shim.cjs';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'site/', 'node_modules/'] },
  {
    files: ['src/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      prettier,
    ],
    rules: {
      // Numbers in template literals (CSS colours, GLSL, labels) are safe and idiomatic.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['tests/**/*.mjs', 'eslint.config.js'],
    extends: [eslint.configs.recommended, prettier],
    languageOptions: { globals: { ...globals.node } },
  },
);
