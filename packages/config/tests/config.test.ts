import { describe, expect, it } from 'vitest';

import eslintConfig, {
  packageBoundaryRules,
  typeAwareParserOptions,
} from '../eslint.config.mjs';
import prettierConfig from '../prettier.config.mjs';
import vitestConfig from '../vitest.config.mjs';

describe('@misyra/config', () => {
  it('exports strict type-aware lint and deterministic format/test defaults', () => {
    expect(typeAwareParserOptions.projectService).toBe(true);
    expect(packageBoundaryRules['no-restricted-imports']).toBeDefined();
    expect(eslintConfig.length).toBeGreaterThan(0);
    expect(prettierConfig).toMatchObject({
      endOfLine: 'lf',
      singleQuote: true,
    });
    expect(vitestConfig.test).toMatchObject({
      environment: 'node',
      restoreMocks: true,
    });
  });
});
