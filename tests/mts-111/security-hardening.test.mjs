import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const data = readFileSync(join(repoRoot, 'infra/azure/modules/data.bicep'), 'utf8');

test('MTS-111 keeps API and cleanup Blob roles scoped to individual private containers', () => {
  const apiScopes = [
    'evidenceWorking',
    'storyWorking',
    'plannerWorking',
    'styleReferences',
    'feedbackRetained',
  ];
  const cleanupScopes = ['evidenceWorking', 'storyWorking', 'plannerWorking', 'styleReferences'];

  for (const scope of apiScopes) {
    assert.match(
      data,
      new RegExp(
        `resource\\s+api\\w+BlobDataContributor[\\s\\S]{0,260}scope\\s*:\\s*${scope}\\b`,
      ),
    );
  }
  for (const scope of cleanupScopes) {
    assert.match(
      data,
      new RegExp(
        `resource\\s+cleanup\\w+BlobDataContributor[\\s\\S]{0,260}scope\\s*:\\s*${scope}\\b`,
      ),
    );
  }

  assert.doesNotMatch(
    data,
    /resource\s+api\w+BlobDataContributor[\s\S]{0,260}scope\s*:\s*storage\b/,
  );
  assert.doesNotMatch(
    data,
    /resource\s+cleanup\w+BlobDataContributor[\s\S]{0,260}scope\s*:\s*storage\b/,
  );
  assert.doesNotMatch(data, /cleanupFeedbackRetainedBlobDataContributor/);
});

test('MTS-111 keeps retained-feedback operator access read-only and group-scoped', () => {
  const reader = data.match(
    /resource\s+feedbackOperationsBlobDataReader[\s\S]*?\n}\n\nresource\s+cleanupEvidenceWorkingBlobDataContributor/,
  )?.[0];
  assert.ok(reader, 'feedback operations reader assignment must exist');
  assert.match(reader, /scope\s*:\s*feedbackRetained\b/);
  assert.match(reader, /2a2b9908-6ea1-4ae2-8e65-a410df84e7d1/);
  assert.match(reader, /principalType\s*:\s*'Group'/);
  assert.doesNotMatch(reader, /ba92f5b4-2d11-453d-a403-e96b0029c9fe/);
});
