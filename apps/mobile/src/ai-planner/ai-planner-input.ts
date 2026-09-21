export const MAX_PLANNER_TEXT_CHARACTERS = 2_000;
export const MAX_PLANNER_IMAGES = 3;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AiPlannerDraftInput = Readonly<{
  text: string;
  imageAssetIds: readonly string[];
}>;

export type SystemPickedImage = Readonly<{
  uri: string;
  mimeType: string | null;
  name: string | null;
}>;

export type SystemFilePicker = (
  options: Readonly<{
    multipleFiles: true;
    mimeTypes: readonly ['image/*'];
  }>,
) => Promise<readonly SystemPickedImage[]>;

export function countPlannerCharacters(text: string): number {
  return Array.from(text).length;
}

function normalizedImageAssetIds(imageAssetIds: readonly string[]): readonly string[] {
  const deduplicated = [...new Set(imageAssetIds)];
  if (deduplicated.length > MAX_PLANNER_IMAGES) {
    throw new RangeError('AI Planner drafts can contain at most three images.');
  }
  for (const assetId of deduplicated) {
    if (!UUID_PATTERN.test(assetId)) {
      throw new TypeError('AI Planner image asset IDs must be UUIDs.');
    }
  }
  return Object.freeze(deduplicated);
}

export function createAiPlannerDraftInput(input: AiPlannerDraftInput): AiPlannerDraftInput {
  if (countPlannerCharacters(input.text) > MAX_PLANNER_TEXT_CHARACTERS) {
    throw new RangeError('AI Planner text cannot exceed 2,000 characters.');
  }
  return Object.freeze({
    text: input.text,
    imageAssetIds: normalizedImageAssetIds(input.imageAssetIds),
  });
}

export function appendPlannerImageAssetIds(
  current: readonly string[],
  added: readonly string[],
): readonly string[] {
  return normalizedImageAssetIds([...current, ...added]);
}

export function createPlannerSystemImagePicker(pickFiles: SystemFilePicker) {
  return Object.freeze({
    async pickImages(): Promise<readonly SystemPickedImage[]> {
      return pickFiles({
        multipleFiles: true,
        mimeTypes: ['image/*'],
      });
    },
  });
}
