/**
 * MTS-012 image harness — deterministic ANDROID capture entry.
 *
 * A separate React Native entry (bundled by Metro, never the product
 * expo-router entry) that renders the REAL MTS-009 primitives surface or
 * the REAL MTS-010 shell-screen surface on the actual Android renderer.
 *
 * The capture configuration is fetched over loopback through `adb reverse`
 * (http://127.0.0.1:58321/config.json) and the surface commit is signalled
 * with a POST /ready so the host screenshots the real framebuffer at a
 * deterministic moment. Text scale and the shell-screen device locale come
 * from the real Android configuration (system font_scale and the device
 * locale), which the harness sets deterministically between captures.
 *
 * No runtime data, no network beyond the loopback config server, no device
 * identity. The host never lets this entry render anything but the
 * deterministic fixture surfaces.
 */
import { useEffect, useState } from "react";
import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { registerRootComponent } from "expo";

import { PrimitivesSurface } from "./fixtures/primitives-surface";
import { ShellScreenSurface } from "./fixtures/shell-screen-surface";

const CAPTURE_CONFIG_URL = "http://127.0.0.1:58321/config.json";
const CAPTURE_READY_URL = "http://127.0.0.1:58321/ready";

interface NativeCaptureConfig {
  readonly surface: "primitives" | "shell-screen";
  readonly mode: "light" | "dark";
  readonly locale: "en" | "zh-HK";
}

function CaptureApp() {
  const [config, setConfig] = useState<NativeCaptureConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 40_000);
        let response;
        try {
          response = await fetch(CAPTURE_CONFIG_URL, { signal: controller.signal });
        } finally {
          clearTimeout(abortTimer);
        }
        if (!response.ok) {
          throw new Error(`capture config server responded ${response.status}`);
        }
        const nextConfig = (await response.json()) as NativeCaptureConfig;
        if (cancelled) {
          return;
        }
        // Paint the surface, then let one more frame commit before telling
        // the host that the screenshot moment has been reached.
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (cancelled) {
              return;
            }
            setConfig(nextConfig);
            requestAnimationFrame(() => {
              if (!cancelled) {
                fetch(CAPTURE_READY_URL, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  // Ack the exact config this entry rendered (including the
                  // system font scale and the pixel density ratio it
                  // observed) so the host only captures frames committed for
                  // the requested combo at the pinned 1x density.
                  body: JSON.stringify({
                    surface: nextConfig.surface,
                    mode: nextConfig.mode,
                    locale: nextConfig.locale,
                    fontScale: Math.round(PixelRatio.getFontScale()),
                    scale: PixelRatio.get(),
                  }),
                }).catch(() => {});
              }
            });
          }, 120);
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) {
    return (
      <View style={styles.fill}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (config === null) {
    return <View style={styles.fill} />;
  }
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {config.surface === "shell-screen" ? (
        <ShellScreenSurface />
      ) : (
        <PrimitivesSurface mode={config.mode} locale={config.locale} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  errorText: {
    padding: 16,
  },
});

registerRootComponent(CaptureApp);