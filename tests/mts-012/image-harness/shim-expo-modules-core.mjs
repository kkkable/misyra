/**
 * MTS-012 image harness — deterministic expo-modules-core browser shim.
 *
 * The REAL expo-localization web implementation (bundled in this harness)
 * imports only `Platform` from expo-modules-core. expo-modules-core's full
 * browser build drags in the expo module registry; the harness substitutes
 * this fixed, deterministic shim instead, so the capture never depends on
 * runtime expo state. Only `Platform` is consumed.
 */
export const Platform = Object.freeze({
  OS: "web",
  isDOMAvailable: true,
  canUseDOM: true,
  isTesting: false,
  isAsyncAvailable: true,
});

export default Object.freeze({ Platform });
