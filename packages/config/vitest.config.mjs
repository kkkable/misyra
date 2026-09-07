import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const mobileSetupFile = fileURLToPath(new URL('./vitest.mobile.setup.mjs', import.meta.url));
const isMobileWorkspace = process.cwd().replaceAll('\\', '/').endsWith('/apps/mobile');

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    restoreMocks: true,
    ...(isMobileWorkspace ? { setupFiles: [mobileSetupFile] } : {}),
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
