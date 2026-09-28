import { ImageFormat, Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import type { FeedbackScreenshot } from './feedback-form.js';

const FEEDBACK_SCREENSHOT_DIRECTORY = `${FileSystem.cacheDirectory ?? ''}misyra/feedback/`;

function requireFeedbackDirectory(): string {
  if (FileSystem.cacheDirectory === null) {
    throw new Error('feedback_screenshot_cache_unavailable');
  }
  return FEEDBACK_SCREENSHOT_DIRECTORY;
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export async function transcodeFeedbackScreenshotToPng(
  sourceUri: string,
): Promise<FeedbackScreenshot> {
  const data = await Skia.Data.fromURI(sourceUri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (image === null) throw new Error('feedback_screenshot_decode_failed');

  const directory = requireFeedbackDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}feedback-${Date.now().toString()}.png`;
  const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return Object.freeze({
    uri,
    mimeType: 'image/png',
    sizeBytes: base64ByteLength(base64),
  });
}

export async function removeFeedbackScreenshotFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
