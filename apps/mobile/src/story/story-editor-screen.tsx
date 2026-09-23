import { useEffect, useMemo, useState } from 'react';
import type { EvidenceStorySourceAttempt } from '../evidence/evidence-api.js';
import {
  PrimaryButton,
  Screen,
  SecondaryButton,
  TextField,
  TopBar,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { createStoryEditorSession, type StorySourceImage } from './story-editor-state.js';
import type { StoryComposition, StoryTextLayer } from './story-composition.js';
import { StorySkiaPreviewView } from './story-skia-preview-view.js';

export type StoryEditorMessages = Readonly<{
  title: string;
  close: string;
  save: string;
  source: string;
  sourcePhoto: string;
  undo: string;
  redo: string;
  zoomIn: string;
  zoomOut: string;
  moveLeft: string;
  moveRight: string;
  moveUp: string;
  moveDown: string;
  headline: string;
  supportingText: string;
  editHeadline: string;
  editSupportingText: string;
  textSmaller: string;
  textLarger: string;
  textColor: string;
  font: string;
  removeText: string;
  contrast: string;
}>;

type TextRole = 'headline' | 'supportingText';

const TEXT_COLORS = ['#FFFFFF', '#111111', '#6D3CF3'] as const;

function sourceLabel(template: string, attemptNumber: number): string {
  return template.replace('{number}', String(attemptNumber));
}

function defaultTextLayer(role: TextRole, text: string): StoryTextLayer {
  return {
    text,
    x: 120,
    y: role === 'headline' ? 260 : 1500,
    width: 840,
    fontSize: role === 'headline' ? 72 : 44,
    fontCategory: role === 'headline' ? 'system-bold' : 'system',
    color: '#FFFFFF',
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function StoryEditorScreen({
  colorScheme,
  composition: savedComposition,
  messages,
  onClose,
  onCompositionChange,
  onSave,
  onSelectSource,
  selectedAttemptId,
  sourceAttempts,
  sourceImage,
}: Readonly<{
  colorScheme: ColorScheme;
  composition: StoryComposition;
  messages: StoryEditorMessages;
  onClose: () => void;
  onCompositionChange: (composition: StoryComposition) => void;
  onSave: (composition: StoryComposition) => void;
  onSelectSource: (source: EvidenceStorySourceAttempt) => void;
  selectedAttemptId: string;
  sourceAttempts: readonly EvidenceStorySourceAttempt[];
  sourceImage: StorySourceImage;
}>) {
  const window = useWindowDimensions();
  const colors = themeColors(colorScheme);
  const session = useMemo(
    () =>
      createStoryEditorSession({
        sourceImage,
        savedComposition,
      }),
    [savedComposition, sourceImage],
  );
  const [composition, setComposition] = useState(() => session.getComposition());
  const [selectedTextRole, setSelectedTextRole] = useState<TextRole>('headline');

  useEffect(() => {
    setComposition(session.getComposition());
    setSelectedTextRole('headline');
  }, [session]);

  const publish = (): StoryComposition => {
    const next = session.getComposition();
    setComposition(next);
    onCompositionChange(next);
    return next;
  };

  const transformBackground = (patch: Partial<StoryComposition['background']>) => {
    session.transformBackground({
      ...composition.background,
      ...patch,
    });
    publish();
  };

  const setLayer = (role: TextRole, layer: StoryTextLayer | null) => {
    if (role === 'headline') session.setHeadline(layer);
    else session.setSupportingText(layer);
    publish();
  };

  const currentLayer =
    selectedTextRole === 'headline' ? composition.headline : composition.supportingText;

  const updateCurrentLayer = (update: (layer: StoryTextLayer) => StoryTextLayer) => {
    if (currentLayer === null) return;
    setLayer(selectedTextRole, update(currentLayer));
  };

  const setText = (role: TextRole, text: string) => {
    const current = role === 'headline' ? composition.headline : composition.supportingText;
    setLayer(
      role,
      text.length === 0 ? null : { ...(current ?? defaultTextLayer(role, text)), text },
    );
  };

  const contrastEffect = composition.effects.find((effect) => effect.kind === 'contrast');
  const currentContrast =
    contrastEffect !== undefined && typeof contrastEffect.amount === 'number'
      ? contrastEffect.amount
      : 0;

  const previewWidth = Math.max(1, window.width - 32);

  return (
    <Screen colorScheme={colorScheme} testID="story-editor">
      <TopBar
        colorScheme={colorScheme}
        title={messages.title}
        leading={
          <SecondaryButton
            accessibilityLabel={messages.close}
            colorScheme={colorScheme}
            label={messages.close}
            onPress={onClose}
            testID="story-close"
          />
        }
        trailing={
          <PrimaryButton
            accessibilityLabel={messages.save}
            colorScheme={colorScheme}
            label={messages.save}
            onPress={() => {
              onSave(composition);
            }}
            testID="story-save"
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{messages.source}</Text>
        <View style={styles.sourceRow}>
          {sourceAttempts.map((source) => {
            const selected = source.attemptId === selectedAttemptId;
            const label = sourceLabel(messages.sourcePhoto, source.attemptNumber);
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={source.attemptId}
                onPress={() => {
                  onSelectSource(source);
                }}
                style={[
                  styles.sourceButton,
                  {
                    backgroundColor: selected ? colors.primarySoft : colors.canvas,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                testID={`story-source-${source.attemptId}`}
              >
                <Text style={{ color: colors.textPrimary }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.previewWrap}>
          <StorySkiaPreviewView
            availableWidth={previewWidth}
            composition={composition}
            sourceImage={sourceImage}
          />
        </View>

        <View style={styles.toolRow}>
          <SecondaryButton
            accessibilityLabel={messages.undo}
            colorScheme={colorScheme}
            disabled={!session.canUndo()}
            label={messages.undo}
            onPress={() => {
              if (session.undo()) publish();
            }}
            testID="story-undo"
          />
          <SecondaryButton
            accessibilityLabel={messages.redo}
            colorScheme={colorScheme}
            disabled={!session.canRedo()}
            label={messages.redo}
            onPress={() => {
              if (session.redo()) publish();
            }}
            testID="story-redo"
          />
        </View>

        <View style={styles.toolRow}>
          <SecondaryButton
            accessibilityLabel={messages.zoomOut}
            colorScheme={colorScheme}
            label={messages.zoomOut}
            onPress={() => {
              transformBackground({ scale: clamp(composition.background.scale - 0.1, 0.5, 3) });
            }}
            testID="story-zoom-out"
          />
          <SecondaryButton
            accessibilityLabel={messages.zoomIn}
            colorScheme={colorScheme}
            label={messages.zoomIn}
            onPress={() => {
              transformBackground({ scale: clamp(composition.background.scale + 0.1, 0.5, 3) });
            }}
            testID="story-zoom-in"
          />
          <SecondaryButton
            accessibilityLabel={messages.contrast}
            colorScheme={colorScheme}
            label={messages.contrast}
            onPress={() => {
              const next = currentContrast >= 0.3 ? 0 : Number((currentContrast + 0.1).toFixed(1));
              if (next === 0) session.removeEffect('contrast');
              else session.setEffect({ kind: 'contrast', amount: next });
              publish();
            }}
            testID="story-contrast"
          />
        </View>

        <View style={styles.toolRow}>
          <SecondaryButton
            accessibilityLabel={messages.moveLeft}
            colorScheme={colorScheme}
            label={messages.moveLeft}
            onPress={() => {
              transformBackground({ translateX: composition.background.translateX - 40 });
            }}
            testID="story-move-left"
          />
          <SecondaryButton
            accessibilityLabel={messages.moveRight}
            colorScheme={colorScheme}
            label={messages.moveRight}
            onPress={() => {
              transformBackground({ translateX: composition.background.translateX + 40 });
            }}
            testID="story-move-right"
          />
          <SecondaryButton
            accessibilityLabel={messages.moveUp}
            colorScheme={colorScheme}
            label={messages.moveUp}
            onPress={() => {
              transformBackground({ translateY: composition.background.translateY - 40 });
            }}
            testID="story-move-up"
          />
          <SecondaryButton
            accessibilityLabel={messages.moveDown}
            colorScheme={colorScheme}
            label={messages.moveDown}
            onPress={() => {
              transformBackground({ translateY: composition.background.translateY + 40 });
            }}
            testID="story-move-down"
          />
        </View>

        <TextField
          accessibilityLabel={messages.headline}
          colorScheme={colorScheme}
          label={messages.headline}
          onChangeText={(text) => {
            setText('headline', text);
          }}
          testID="story-headline-input"
          value={composition.headline?.text ?? ''}
        />
        <TextField
          accessibilityLabel={messages.supportingText}
          colorScheme={colorScheme}
          label={messages.supportingText}
          onChangeText={(text) => {
            setText('supportingText', text);
          }}
          testID="story-supporting-input"
          value={composition.supportingText?.text ?? ''}
        />

        <View style={styles.toolRow}>
          <SecondaryButton
            accessibilityLabel={messages.editHeadline}
            colorScheme={colorScheme}
            label={messages.editHeadline}
            onPress={() => {
              setSelectedTextRole('headline');
            }}
            testID="story-edit-headline"
          />
          <SecondaryButton
            accessibilityLabel={messages.editSupportingText}
            colorScheme={colorScheme}
            label={messages.editSupportingText}
            onPress={() => {
              setSelectedTextRole('supportingText');
            }}
            testID="story-edit-supporting"
          />
        </View>

        <View style={styles.toolRow}>
          <SecondaryButton
            accessibilityLabel={messages.textSmaller}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.textSmaller}
            onPress={() => {
              updateCurrentLayer((layer) => ({
                ...layer,
                fontSize: clamp(layer.fontSize - 8, 20, 160),
              }));
            }}
            testID="story-text-smaller"
          />
          <SecondaryButton
            accessibilityLabel={messages.textLarger}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.textLarger}
            onPress={() => {
              updateCurrentLayer((layer) => ({
                ...layer,
                fontSize: clamp(layer.fontSize + 8, 20, 160),
              }));
            }}
            testID="story-text-larger"
          />
          <SecondaryButton
            accessibilityLabel={messages.textColor}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.textColor}
            onPress={() => {
              updateCurrentLayer((layer) => {
                const index = TEXT_COLORS.indexOf(layer.color as (typeof TEXT_COLORS)[number]);
                return {
                  ...layer,
                  color: TEXT_COLORS[(index + 1 + TEXT_COLORS.length) % TEXT_COLORS.length],
                };
              });
            }}
            testID="story-text-color"
          />
          <SecondaryButton
            accessibilityLabel={messages.font}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.font}
            onPress={() => {
              updateCurrentLayer((layer) => ({
                ...layer,
                fontCategory: layer.fontCategory === 'system-bold' ? 'system' : 'system-bold',
              }));
            }}
            testID="story-font"
          />
        </View>

        <View style={styles.toolRow}>
          <SecondaryButton
            accessibilityLabel={messages.moveLeft}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.moveLeft}
            onPress={() => {
              updateCurrentLayer((layer) => ({ ...layer, x: layer.x - 40 }));
            }}
            testID="story-text-left"
          />
          <SecondaryButton
            accessibilityLabel={messages.moveRight}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.moveRight}
            onPress={() => {
              updateCurrentLayer((layer) => ({ ...layer, x: layer.x + 40 }));
            }}
            testID="story-text-right"
          />
          <SecondaryButton
            accessibilityLabel={messages.moveUp}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.moveUp}
            onPress={() => {
              updateCurrentLayer((layer) => ({ ...layer, y: layer.y - 40 }));
            }}
            testID="story-text-up"
          />
          <SecondaryButton
            accessibilityLabel={messages.moveDown}
            colorScheme={colorScheme}
            disabled={currentLayer === null}
            label={messages.moveDown}
            onPress={() => {
              updateCurrentLayer((layer) => ({ ...layer, y: layer.y + 40 }));
            }}
            testID="story-text-down"
          />
        </View>

        <SecondaryButton
          accessibilityLabel={messages.removeText}
          colorScheme={colorScheme}
          disabled={currentLayer === null}
          label={messages.removeText}
          onPress={() => {
            setLayer(selectedTextRole, null);
          }}
          testID="story-remove-text"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 32,
  },
  previewWrap: {
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sourceButton: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
