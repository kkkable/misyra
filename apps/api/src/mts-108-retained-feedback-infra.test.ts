import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const dataPath = fileURLToPath(new URL('../../../infra/azure/modules/data.bicep', import.meta.url));
const mainPath = fileURLToPath(new URL('../../../infra/azure/main.bicep', import.meta.url));

describe('MTS-108 retained feedback access configuration', () => {
  it('grants the API write access and the configured operations group read-only access only to feedback-retained', async () => {
    const [data, main] = await Promise.all([
      readFile(dataPath, 'utf8'),
      readFile(mainPath, 'utf8'),
    ]);

    expect(data).toContain('param feedbackOperationsPrincipalId string');
    expect(main).toContain('param feedbackOperationsPrincipalId string');
    expect(main).toContain('feedbackOperationsPrincipalId: feedbackOperationsPrincipalId');

    expect(data).toContain('apiFeedbackRetainedBlobDataContributor');
    expect(data).toMatch(
      /resource apiFeedbackRetainedBlobDataContributor[\s\S]*?scope:\s*feedbackRetained[\s\S]*?principalId:\s*apiPrincipalId/u,
    );

    expect(data).toContain('feedbackOperationsBlobDataReader');
    expect(data).toMatch(
      /resource feedbackOperationsBlobDataReader[\s\S]*?scope:\s*feedbackRetained[\s\S]*?2a2b9908-6ea1-4ae2-8e65-a410df84e7d1[\s\S]*?principalId:\s*feedbackOperationsPrincipalId/u,
    );
    expect(data).toMatch(
      /resource feedbackOperationsBlobDataReader[^=]*=\s*if\s*\(!empty\(feedbackOperationsPrincipalId\)\)/u,
    );

    const cleanupAssignments = data.match(
      /resource cleanup[\s\S]*?Microsoft\.Authorization\/roleAssignments[\s\S]*?\n\}/gu,
    );
    expect(JSON.stringify(cleanupAssignments ?? [])).not.toContain('feedbackRetained');

    const lifecycle = data.slice(data.indexOf("name: 'product-media-day-31-defense-in-depth'"));
    expect(lifecycle.slice(0, 2200)).not.toContain("'feedback-retained/'");
  });
});
