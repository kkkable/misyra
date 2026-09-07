import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const mobileNativeRuntimeStub = fileURLToPath(
  new URL('./vitest.mobile.setup.mjs', import.meta.url),
);
const isMobileWorkspace = process.cwd().replaceAll('\\', '/').endsWith('/apps/mobile');

export default defineConfig({
  ...(isMobileWorkspace
    ? {
        resolve: {
          alias: {
            'react-native-gesture-handler': mobileNativeRuntimeStub,
            'react-native-reanimated': mobileNativeRuntimeStub,
            'react-native-worklets': mobileNativeRuntimeStub,
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
