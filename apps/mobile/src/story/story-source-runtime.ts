import type { EvidenceStorySourceAttempt } from '../evidence/evidence-api.js';

export type StorySourceMaterialized = Readonly<{
  attemptId: string;
  imageVersionId: string;
  uri: string;
  width: number;
  height: number;
}>;

export type StorySourceFiles = Readonly<{
  copyOriginalToStoryWorking(
    attemptId: string,
    imageVersionId: string,
  ): Promise<Readonly<{ uri: string; width: number; height: number }>>;
}>;

export function createStorySourceRuntime(
  input: Readonly<{
    api: Pick<
      ReturnType<typeof import('../evidence/evidence-api.js').createEvidenceApi>,
      'listStorySourceAttempts'
    >;
    files: StorySourceFiles;
  }>,
) {
  return Object.freeze({
    list(occurrenceId: string): Promise<readonly EvidenceStorySourceAttempt[]> {
      return input.api.listStorySourceAttempts(occurrenceId);
    },

    async materialize(
      source: EvidenceStorySourceAttempt,
      imageVersionId: string,
    ): Promise<StorySourceMaterialized> {
      const copied = await input.files.copyOriginalToStoryWorking(source.attemptId, imageVersionId);
      return Object.freeze({
        attemptId: source.attemptId,
        imageVersionId,
        uri: copied.uri,
        width: copied.width,
        height: copied.height,
      });
    },
  });
}
