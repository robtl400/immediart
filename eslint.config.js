import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Node utility scripts — not part of the browser bundle
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Test files — empty catch blocks are used deliberately to trip the
    // circuit breaker and assert on state afterwards
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.js'],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
])
