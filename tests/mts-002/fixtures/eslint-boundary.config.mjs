import {
  packageBoundaryRules,
} from '../../../packages/config/eslint.config.mjs';

export default [
  {
    files: ['**/*.ts'],
    rules: packageBoundaryRules,
  },
];
