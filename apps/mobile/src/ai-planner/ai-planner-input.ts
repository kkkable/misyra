export const MAX_PLANNER_TEXT_CHARACTERS = 2_000;
export const MAX_PLANNER_IMAGES = 3;

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

export function countPlannerCharacters(_text: string): number {
  return 0;
}

export function createAiPlannerDraftInput(_input: AiPlannerDraftInput): AiPlannerDraftInput {
  throw new Error('MTS-086 planner input is not implemented.');
}

export function appendPlannerImageAssetIds(
  _current: readonly string[],
  _added: readonly string[],
): readonly string[] {
  throw new Error('MTS-086 planner image limits are not implemented.');
}

export function createPlannerSystemImagePicker(_pickFiles: SystemFilePicker) {
  return Object.freeze({
    async pickImages(): Promise<readonly SystemPickedImage[]> {
      throw new Error('MTS-086 system image picker is not implemented.');
    },
  });
}
