import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.ts', '**/*.tsx'];

export const typeAwareParserOptions = Object.freeze({
  projectService: true,
  onUnsupportedTypeScriptVersion: 'error',
});

/** @type {import('eslint').Linter.RuleEntry} */
const noRestrictedImportsRule = [
  'error',
  {
    patterns: [
      {
        group: ['@misyra/*/src/**', '@misyra/*/src/*'],
        message:
          'Cross-package deep imports are forbidden. Import only from explicit package exports.',
      },
    ],
  },
];

/** @type {Readonly<import('eslint').Linter.RulesRecord>} */
export const packageBoundaryRules = Object.freeze({
  'no-restricted-imports': noRestrictedImportsRule,
});

const strictTypeChecked = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: typescriptFiles,
}));

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...strictTypeChecked,
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: typeAwareParserOptions,
    },
    rules: packageBoundaryRules,
  },
  {
    files: ['src/sync/apple-calendar-mobile-sync.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_(?:accountId|deviceId)$' },
      ],
    },
  },
  {
    files: [
      'src/sync/apple-calendar-mobile-sync.test.mjs',
      'src/sync/apple-calendar-mobile-sync-store.test.mjs',
    ],
    languageOptions: {
      globals: {
        crypto: 'readonly',
      },
    },
  },
);
