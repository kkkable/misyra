import { File } from 'expo-file-system';

export type StoryStyleReferenceImage = Readonly<{
  uri: string;
  mimeType: string | null;
  name: string | null;
}>;

export async function pickStoryStyleReferenceImages(): Promise<
  readonly StoryStyleReferenceImage[]
> {
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
