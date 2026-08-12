/**
 * Expo application configuration for the Misyra mobile shell (MTS-003).
 *
 * Scaffold-only configuration: no provider keys, no EAS project linkage, and
 * no production credentials.
 *
 * MISYRA_HARNESS_BUILD=1 additionally prepares the MTS-012 image-harness
 * android build: it allows cleartext loopback traffic so the harness entry
 * (tests/mts-012/image-harness/native-entry.tsx) can fetch the capture
 * configuration from the host over `adb reverse` (127.0.0.1). Normal product
 * builds never set the flag, so the product manifest stays unchanged.
 */
import type { ExpoConfig } from "expo/config";
import { withAndroidManifest, type ConfigPlugin } from "expo/config-plugins";

const isHarnessBuild = process.env.MISYRA_HARNESS_BUILD === "1";

/**
 * Harness-only manifest tweak: allow cleartext loopback traffic so the
 * MTS-012 image-harness entry can fetch its capture configuration from the
 * host over `adb reverse` (http://127.0.0.1:58321). The config schema has
 * no usesCleartextTraffic flag, so the plugin sets it on the generated
 * <application> element. Never applied outside MISYRA_HARNESS_BUILD=1.
 */
const withHarnessCleartext: ConfigPlugin = (config) =>
  withAndroidManifest(config, (pluginConfig) => {
    const application = pluginConfig.modResults.manifest.application?.[0];
    if (application !== undefined) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return pluginConfig;
  });

const config: ExpoConfig = {
  name: "Misyra",
  slug: "misyra",
  scheme: "misyra",
  version: "0.0.0",
  orientation: "portrait",
  ...(isHarnessBuild
    ? {
        android: {
          package: "com.anonymous.misyra",
        },
      }
    : {}),
};

export default isHarnessBuild ? withHarnessCleartext(config) : config;
