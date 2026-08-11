/**
 * MTS-012 screenshot fixture — REAL MTS-010 calendar-tab shell surface.
 *
 * Renders exactly what the real app shows for the Calendar tab at MTS-010:
 * the PlaceholderScreen component with the approved catalog keys, resolving
 * its catalog through the real device-catalog path (expo-localization web
 * implementation reading navigator.languages, which the capture context
 * pins to the requested locale). The tab bar chrome itself is rendered by
 * expo-router at runtime and is out of scope for the image harness (the
 * manifest layer asserts its layout model); this fixture captures the real
 * shell content surface.
 */
import { PlaceholderScreen } from "../../../../apps/mobile/src/components/PlaceholderScreen";

export function ShellScreenSurface() {
  return <PlaceholderScreen titleKey="tabs.calendar" bodyKey="placeholders.calendar" />;
}
