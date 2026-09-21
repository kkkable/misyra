import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function readRepositoryFile(path: string) {
  return readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('MTS-085 cleanup job infrastructure', () => {
  it('schedules the cleanup command and gives its managed identity the storage account name', async () => {
    const compute = await readRepositoryFile('infra/azure/modules/compute.bicep');

    expect(compute).toMatch(/name:\s*'cleanup'/);
    expect(compute).toMatch(/triggerType:\s*'Schedule'/);
    expect(compute).toMatch(/scheduleTriggerConfig:\s*\{/);
    expect(compute).toMatch(/cronExpression:\s*'\*\/1 \* \* \* \*'/);
    expect(compute).toMatch(/'dist\/index\.js'[\s\S]*'cleanup'/);
    expect(compute).toMatch(
      /name:\s*'AZURE_STORAGE_ACCOUNT_NAME'[\s\S]*value:\s*storageAccountName/,
    );
    expect(compute).toMatch(
      /output\s+cleanupJobPrincipalId\s+string\s*=\s*cleanupJob\.identity\.principalId/,
    );
  });

  it('grants cleanup access only to product-media containers', async () => {
    const [main, data] = await Promise.all([
      readRepositoryFile('infra/azure/main.bicep'),
      readRepositoryFile('infra/azure/modules/data.bicep'),
    ]);

    expect(main).toMatch(/cleanupJobPrincipalId:\s*compute\.outputs\.cleanupJobPrincipalId/);
    expect(data).toMatch(/param\s+cleanupJobPrincipalId\s+string/);
    expect(data.match(/principalId:\s*cleanupJobPrincipalId/g)).toHaveLength(4);
    for (const scope of ['evidenceWorking', 'storyWorking', 'plannerWorking', 'styleReferences']) {
      expect(data).toMatch(new RegExp(`scope:\\s*${scope}\\b`));
    }
    expect(data).not.toMatch(/scope:\s*feedbackRetained\b/);
  });

  it('keeps recoverable deletion features off and limits day-31 defense-in-depth lifecycle to product media', async () => {
    const data = await readRepositoryFile('infra/azure/modules/data.bicep');

    expect(data).toMatch(/isVersioningEnabled:\s*false/);
    expect(data).toMatch(/deleteRetentionPolicy:\s*\{[\s\S]*?enabled:\s*false/);
    expect(data).toMatch(/containerDeleteRetentionPolicy:\s*\{[\s\S]*?enabled:\s*false/);
    expect(data).toMatch(/name:\s*'product-media-day-31-defense-in-depth'/);
    expect(data).toMatch(/daysAfterCreationGreaterThan:\s*30/);
    for (const prefix of [
      'evidence-working/',
      'story-working/',
      'planner-working/',
      'style-references/',
    ]) {
      expect(data).toContain(`'${prefix}'`);
    }
    const lifecycle = data.slice(data.indexOf("name: 'product-media-day-31-defense-in-depth'"));
    expect(lifecycle.slice(0, 1800)).not.toContain("'feedback-retained/'");
  });
});
