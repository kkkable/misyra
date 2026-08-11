/**
 * Story — full-screen modal route boundary (MTS-010).
 *
 * Sits above the tab navigator per technical specification section 8.
 * MTS-010 owns only the route boundary; story editing content belongs to
 * later tickets.
 */
import { PlaceholderScreen } from "../src/components/PlaceholderScreen";

export default function StoryModal() {
  return <PlaceholderScreen titleKey="placeholders.storyTitle" bodyKey="placeholders.story" />;
}
