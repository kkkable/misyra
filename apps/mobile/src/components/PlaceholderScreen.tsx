/**
 * Minimal placeholder screen for the MTS-003 tab shell.
 *
 * Deliberately non-product-specific: no design token values, no motion, and
 * no feature content. Both visible strings come from the localization
 * boundary (technical specification section 5.1).
 */
import { StyleSheet, Text, View } from "react-native";
import { translate, type LocalizationKey } from "@misyra/localization";
import { deviceCatalog } from "../localization/device-catalog";

interface PlaceholderScreenProps {
  /** Localization key for the tab title. */
  titleKey: LocalizationKey;
  /** Localization key for the placeholder body copy. */
  bodyKey: LocalizationKey;
}

/**
 * Render the approved placeholder content for one root tab.
 *
 * @param props localization keys identifying the tab copy.
 */
export function PlaceholderScreen({ titleKey, bodyKey }: PlaceholderScreenProps) {
  const catalog = deviceCatalog();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(catalog, titleKey)}</Text>
      <Text style={styles.body}>{translate(catalog, bodyKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 24,
  },
  body: {
    fontSize: 16,
  },
});
