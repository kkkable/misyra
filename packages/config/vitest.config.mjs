import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const mobileGestureHandlerStub = fileURLToPath(
  new URL('./vitest.mobile.setup.mjs', import.meta.url),
);
const mobileReanimatedStub = fileURLToPath(
  new URL('./vitest.mobile.reanimated.mjs', import.meta.url),
);
const mobileWorkletsStub = fileURLToPath(new URL('./vitest.mobile.worklets.mjs', import.meta.url));
const isMobileWorkspace = process.cwd().replaceAll('\\', '/').endsWith('/apps/mobile');

export default defineConfig({
  ...(isMobileWorkspace
    ? {
        resolve: {
          alias: {
            'react-native-gesture-handler': mobileGestureHandlerStub,
            'react-native-reanimated': mobileReanimatedStub,
            'react-native-worklets': mobileWorkletsStub,
          },
        },
      }
    : {}),
  test: {
    clearMocks: true,
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
