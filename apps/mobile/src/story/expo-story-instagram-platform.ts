import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';

import type { StoryInstagramPlatform } from './story-instagram-sharing.js';

const INSTAGRAM_APP_URL = 'instagram://app';
const INSTAGRAM_WEB_URL = 'https://www.instagram.com/';

export function createExpoStoryInstagramPlatform(): StoryInstagramPlatform {
  return Object.freeze({
    async copyText(value: string): Promise<void> {
      await Clipboard.setStringAsync(value);
    },

    async openInstagram(): Promise<void> {
      try {
        await Linking.openURL(INSTAGRAM_APP_URL);
      } catch {
        await Linking.openURL(INSTAGRAM_WEB_URL);
      }
    },
  });
}
