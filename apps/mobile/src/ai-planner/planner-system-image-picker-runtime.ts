import { File } from 'expo-file-system';

import {
  createPlannerSystemImagePicker,
  type SystemPickedImage,
} from './ai-planner-input.js';

async function pickSystemImageFiles(): Promise<readonly SystemPickedImage[]> {
  const result = await File.pickFileAsync({
    multipleFiles: true,
    mimeTypes: ['image/*'],
  });
  if (result.canceled) return [];
  return result.result.map((file) => ({
    uri: file.uri,
    mimeType: typeof file.type === 'string' && file.type.length > 0 ? file.type : null,
    name: typeof file.name === 'string' && file.name.length > 0 ? file.name : null,
  }));
}

export const plannerSystemImagePicker = createPlannerSystemImagePicker(() =>
  pickSystemImageFiles(),
);
