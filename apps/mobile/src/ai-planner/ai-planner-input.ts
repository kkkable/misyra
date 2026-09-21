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

export function countPlannerCharacters(text: string): number {
  void text;
  return 0;
}

export function createAiPlannerDraftInput(input: AiPlannerDraftInput): AiPlannerDraftInput {
  void input;
  throw new Error('MTS-086 planner input is not implemented.');
}

export function appendPlannerImageAssetIds(
  current: readonly string[],
  added: readonly string[],
): readonly string[] {
  void current;
  void added;
  throw new Error('MTS-086 planner image limits are not implemented.');
}

export function createPlannerSystemImagePicker(pickFiles: SystemFilePicker) {
  return Object.freeze({
    async pickImages(): Promise<readonly SystemPickedImage[]> {
      await Promise.resolve();
      void pickFiles;
      throw new Error('MTS-086 system image picker is not implemented.');
    },
  });
}
