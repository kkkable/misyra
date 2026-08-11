/**
 * MTS-012 image harness — capture page entry (browser bundle).
 *
 * Reads the capture configuration the harness injects before the bundle
 * executes, renders the requested REAL surface, and signals readiness only
 * after the first painted frames so screenshots are deterministic.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PrimitivesSurface } from "./fixtures/primitives-surface";
import { ShellScreenSurface } from "./fixtures/shell-screen-surface";

export interface CaptureConfig {
  readonly surface: "primitives" | "shell-screen";
  readonly appearance: "light" | "dark";
  readonly locale: "en" | "zh-HK";
  readonly textScale: 1 | 2;
}

const config = (globalThis as { __MISYRA_CAPTURE_CONFIG__?: CaptureConfig })
  .__MISYRA_CAPTURE_CONFIG__ ?? {
  surface: "primitives",
  appearance: "light",
  locale: "en",
  textScale: 1,
};

function App() {
  if (config.surface === "shell-screen") {
    return <ShellScreenSurface />;
  }
  return <PrimitivesSurface mode={config.appearance} locale={config.locale} />;
}

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("MTS-012 image harness: #root element missing");
}

createRoot(rootEl).render(
  <StrictMode>
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  </StrictMode>,
);

// Signal readiness after the first two animation frames (layout + paint),
// the same point every capture waits for.
function markRendered() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      (globalThis as { __MISYRA_RENDERED__?: boolean }).__MISYRA_RENDERED__ = true;
    });
  });
}
markRendered();
