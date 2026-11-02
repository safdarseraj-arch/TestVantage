import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'eslint-current.json', 'eslint-after-fix.json']),
  js.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  {
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['src/utils/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      // OCR / regex utilities intentionally escape brackets and control chars.
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'server/**/*.js', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
