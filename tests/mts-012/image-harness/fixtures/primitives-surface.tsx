/**
 * MTS-012 screenshot fixture — REAL MTS-009 primitive inventory surface.
 *
 * A deterministic composition of the real primitive components (imported
 * directly from apps/mobile/src/primitives) covering the approved inventory:
 * Screen, TopBar, SectionHeading, Row, Card, SettingsRow, TextField, TextArea,
 * Button (all variants), IconButton, and EmptyState. Every visible string
 * comes from the real en / zh-HK localization catalogs; the only non-catalog
 * content is the deterministic glyph set ("←", "★") that IconButton and
 * EmptyState need as icon stand-ins, and empty form values that reveal the
 * placeholder styling. No device identity, no runtime data, no network.
 */
import { type LocalizationCatalog, catalogs, translate } from "@misyra/localization";

import {
  type ThemeMode,
  Button,
  Card,
  EmptyState,
  IconButton,
  Row,
  Screen,
  SectionHeading,
  SettingsRow,
  TextArea,
  TextField,
  TopBar,
} from "../../../../apps/mobile/src/primitives";

/** Deterministic icon stand-ins for controls that render a glyph node. */
const GLYPH_BACK = "\u2190";
const GLYPH_STAR = "\u2605";

export interface PrimitivesSurfaceProps {
  readonly mode: ThemeMode;
  readonly locale: "en" | "zh-HK";
}

export function PrimitivesSurface({ mode, locale }: PrimitivesSurfaceProps) {
  const catalog: LocalizationCatalog = catalogs[locale];
  return (
    <Screen mode={mode}>
      <TopBar mode={mode} title={translate(catalog, "tabs.calendar")} />
      <SectionHeading mode={mode} title={translate(catalog, "tabs.settings")} />
      <SettingsRow
        mode={mode}
        label={translate(catalog, "tabs.progress")}
        value={translate(catalog, "placeholders.storyTitle")}
      />
      <Row
        mode={mode}
        title={translate(catalog, "tabs.aiPlanner")}
        detail={translate(catalog, "placeholders.aiPlanner")}
      />
      <Card mode={mode}>
        <Row
          mode={mode}
          title={translate(catalog, "tabs.calendar")}
          detail={translate(catalog, "placeholders.calendar")}
        />
      </Card>
      <TextField
        mode={mode}
        label={translate(catalog, "tabs.settings")}
        placeholder={translate(catalog, "placeholders.settings")}
      />
      <TextArea
        mode={mode}
        label={translate(catalog, "tabs.progress")}
        placeholder={translate(catalog, "placeholders.progress")}
      />
      <Button mode={mode} label={translate(catalog, "tabs.calendar")} variant="primary" />
      <Button mode={mode} label={translate(catalog, "tabs.aiPlanner")} variant="secondary" />
      <Button mode={mode} label={translate(catalog, "tabs.progress")} variant="destructive" />
      <IconButton mode={mode} label={translate(catalog, "tabs.settings")} glyph={GLYPH_BACK} />
      <EmptyState
        mode={mode}
        title={translate(catalog, "placeholders.evidenceTitle")}
        message={translate(catalog, "placeholders.evidence")}
        glyph={GLYPH_STAR}
        action={
          <Button mode={mode} label={translate(catalog, "tabs.progress")} variant="secondary" />
        }
      />
    </Screen>
  );
}
