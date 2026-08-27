import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.ts', '**/*.tsx'];

export const typeAwareParserOptions = Object.freeze({
  projectService: true,
  onUnsupportedTypeScriptVersion: 'error',
});

/** @type {Readonly<import('eslint').Linter.RulesRecord>} */
export const packageBoundaryRules = Object.freeze({
  'no-restricted-imports': [
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
  ],
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
);
