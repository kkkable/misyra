/**
 * Unmatched-route fallback for the Misyra mobile shell (MTS-010).
 *
 * Invalid, unsupported, or deleted-target deep-link paths resolve here and
 * are deterministically redirected to Calendar, the product-safe default
 * root (technical specification section 8).
 */
import { Redirect } from "expo-router";

export default function UnmatchedRoute() {
  return <Redirect href="/" />;
}
