/**
 * Evidence — full-screen modal route boundary (MTS-010).
 *
 * Sits above the tab navigator per technical specification section 8.
 * MTS-010 owns only the route boundary; camera capture and review content
 * belong to later tickets.
 */
import { PlaceholderScreen } from "../src/components/PlaceholderScreen";

export default function EvidenceModal() {
  return (
    <PlaceholderScreen titleKey="placeholders.evidenceTitle" bodyKey="placeholders.evidence" />
  );
}
