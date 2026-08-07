/**
 * Calendar tab — the default root destination
 * (technical specification section 8).
 *
 * MTS-003 ships only the approved placeholder shell; the Calendar product
 * screen belongs to later tickets.
 */
import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";

export default function CalendarTab() {
  return <PlaceholderScreen titleKey="tabs.calendar" bodyKey="placeholders.calendar" />;
}
