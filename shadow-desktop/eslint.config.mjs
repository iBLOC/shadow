import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import i18next from 'eslint-plugin-i18next';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint configuration for shadow-desktop
 * Includes i18n linting rules for i18next
 */
export default [
  // 1. Base JavaScript rules
  js.configs.recommended,

  // 2. TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
      i18next,
    },
    rules: {
      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Disable base rules that conflict with TypeScript
      'no-unused-vars': 'off',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      // i18n linting rules - PREVENT HARD-CODED TEXT
      'i18next/no-literal-string': [
        'error',
        {
          // Exclude certain contexts where literal strings are acceptable
          excludeFiles: ['**/*.json', '**/*.md', '**/*.test.*', '**/*.spec.*', 'src/config/**', 'src/i18n/**'],
          excludeLiterals: [
            // Allow console.log, URLs, file paths
            { pattern: /^console\.(log|warn|error)/ },
            { pattern: /^(https?:\/\/|mailto:|tel:)/ },
            { pattern: /^[\./].*/ },
          ],
          // Allow specific components that handle their own i18n
          ignoreAttributes: ['aria-label', 'aria-placeholder', 'alt'],
          ignoreComponent: ['CodeBlock', 'MarkdownRenderer'],
        },
      ],
    },
  },

  // 3. JSON files (translation files themselves)
  {
    files: ['**/*.json'],
    rules: {
      // Allow comments in JSON (some translation tools add them)
      'no-trailing-spaces': 'warn',
    },
  },

  // 4. Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src-tauri/**',
      '.opencode/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
];
