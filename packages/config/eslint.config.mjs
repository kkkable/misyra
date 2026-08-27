import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export const typeAwareParserOptions = Object.freeze({
  projectService: true,
  onUnsupportedTypeScriptVersion: 'error',
});

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

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: typeAwareParserOptions,
    },
    rules: packageBoundaryRules,
  },
);
