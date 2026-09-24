import type { StoryStyleReferenceImage } from './story-style-profile-reference-picker.js';

type StoryStyleProfileMediaApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

type UploadAuthorization = Readonly<{
  assetId: string;
  uploadPath: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('story_style_profile_media_request_failed');
  }
  return value.payload;
}

function imageContentType(image: StoryStyleReferenceImage): string {
  const supplied = image.mimeType?.toLowerCase();
  if (supplied?.startsWith('image/')) return supplied;
  const name = image.name?.toLowerCase() ?? '';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  throw new Error('story_style_profile_image_content_type_unavailable');
}

function parseAuthorization(value: unknown, assetId: string): UploadAuthorization {
  if (!isRecord(value) || value.assetId !== assetId || typeof value.uploadPath !== 'string') {
    throw new Error('story_style_profile_media_authorization_invalid');
  }
  return { assetId, uploadPath: value.uploadPath };
}

export function createStoryStyleProfileMediaApi({
  baseUrl,
  accessToken,
}: StoryStyleProfileMediaApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const authorization = `Bearer ${accessToken}`;

  return Object.freeze({
    async uploadOriginal(assetId: string, image: StoryStyleReferenceImage): Promise<void> {
      const contentType = imageContentType(image);
      const response = await fetch(
        `${root}/v1/media/assets/${encodeURIComponent(assetId)}/upload-authorizations`,
        {
          method: 'POST',
          headers: {
            authorization,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            purpose: 'style-references',
            variant: 'original',
            contentType,
          }),
        },
      );
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_style_profile_media_authorization_failed');
      const upload = parseAuthorization(payloadFromEnvelope(responseBody), assetId);

      const localFile = await fetch(image.uri);
      if (!localFile.ok) throw new Error('story_style_profile_local_image_unavailable');
      const uploadResponse = await fetch(`${root}${upload.uploadPath}`, {
        method: 'PUT',
        headers: {
          authorization,
          'content-type': 'application/octet-stream',
        },
        body: await localFile.blob(),
      });
      if (!uploadResponse.ok) throw new Error('story_style_profile_media_upload_failed');
    },
  });
}
