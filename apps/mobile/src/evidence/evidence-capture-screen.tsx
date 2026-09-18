import { useEffect, useState, type ComponentType } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { themeColors, type ColorScheme } from '../design-system/index.js';

export type EvidencePermissionStatus = 'undetermined' | 'granted' | 'denied' | 'unavailable';

export type ProtectedEvidenceFile = Readonly<{
  uri: string;
}>;

export type EvidenceCaptureRuntime = Readonly<{
  permission: Readonly<{
    getStatus(): Promise<EvidencePermissionStatus>;
    request(): Promise<EvidencePermissionStatus>;
    openSettings(): Promise<void>;
    subscribeToAppActive(listener: () => void): () => void;
  }>;
  camera: Readonly<{
    Preview: ComponentType<Readonly<{ active: boolean }>>;
    capture(): Promise<Readonly<{ uri: string }>>;
  }>;
  files: Readonly<{
    protectOriginal(sourceUri: string): Promise<ProtectedEvidenceFile>;
    discard(uri: string): Promise<void>;
  }>;
}>;

export type EvidenceCaptureMessages = Readonly<{
  close: string;
  permissionTitle: string;
  permissionBody: string;
  openSettings: string;
  capture: string;
  retake: string;
  submit: string;
  captureFailed: string;
}>;

type EvidenceCaptureScreenProps = Readonly<{
  runtime: EvidenceCaptureRuntime;
  messages: EvidenceCaptureMessages;
  colorScheme?: ColorScheme;
  onClose(): void;
  onSubmit(file: ProtectedEvidenceFile): void | Promise<void>;
}>;

type FlowState = 'checking' | 'camera' | 'denied';

async function resolvePermission(
  runtime: EvidenceCaptureRuntime,
): Promise<EvidencePermissionStatus> {
  const current = await runtime.permission.getStatus();
  if (current !== 'undetermined') return current;
  return runtime.permission.request();
}

export function EvidenceCaptureScreen({
  runtime,
  messages,
  colorScheme = 'dark',
  onClose,
  onSubmit,
}: EvidenceCaptureScreenProps) {
  const colors = themeColors(colorScheme);
  const [flowState, setFlowState] = useState<FlowState>('checking');
  const [captured, setCaptured] = useState<ProtectedEvidenceFile | null>(null);
  const [captureError, setCaptureError] = useState(false);
  const [busy, setBusy] = useState(false);
  const Preview = runtime.camera.Preview;

  useEffect(() => {
    let mounted = true;

    const applyStatus = (status: EvidencePermissionStatus) => {
      if (!mounted) return;
      setFlowState(status === 'granted' ? 'camera' : 'denied');
    };

    void resolvePermission(runtime)
      .then(applyStatus)
      .catch(() => {
        if (mounted) setFlowState('denied');
      });

    const unsubscribe = runtime.permission.subscribeToAppActive(() => {
      void runtime.permission
        .getStatus()
        .then(applyStatus)
        .catch(() => undefined);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [runtime]);

  const close = async () => {
    if (busy) return;
    if (captured !== null) {
      await runtime.files.discard(captured.uri).catch(() => undefined);
    }
    onClose();
  };

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    setCaptureError(false);
    try {
      const source = await runtime.camera.capture();
      const protectedOriginal = await runtime.files.protectOriginal(source.uri);
      setCaptured(protectedOriginal);
    } catch {
      setCaptureError(true);
    } finally {
      setBusy(false);
    }
  };

  const retake = async () => {
    if (busy || captured === null) return;
    setBusy(true);
    try {
      await runtime.files.discard(captured.uri);
      setCaptured(null);
      setCaptureError(false);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy || captured === null) return;
    setBusy(true);
    try {
      await onSubmit(captured);
    } finally {
      setBusy(false);
    }
  };

  if (flowState === 'checking') {
    return (
      <View
        testID="evidence-permission-check"
        style={[styles.fill, { backgroundColor: colors.canvas }]}
      />
    );
  }

  if (flowState === 'denied') {
    return (
      <View style={[styles.permission, { backgroundColor: colors.canvas }]}>
        <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>
          {messages.permissionTitle}
        </Text>
        <Text style={[styles.permissionBody, { color: colors.textSecondary }]}>
          {messages.permissionBody}
        </Text>
        <Pressable
          accessibilityRole="button"
          testID="evidence-open-settings"
          onPress={() => {
            void runtime.permission.openSettings();
          }}
          style={[styles.permissionAction, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.actionText, { color: colors.primaryText }]}>
            {messages.openSettings}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void close()}
          style={styles.closeTextAction}
        >
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
            {messages.close}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.canvas }]}>
      {captured === null ? (
        <View style={styles.fill}>
          <Preview active={!busy} />
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              testID="evidence-close"
              onPress={() => void close()}
              style={[styles.roundAction, { backgroundColor: colors.overlay }]}
            >
              <Text style={[styles.closeLabel, { color: colors.primaryText }]}>
                {messages.close}
              </Text>
            </Pressable>
          </View>
          <View style={styles.captureBar}>
            {captureError ? (
              <Text style={[styles.captureError, { color: colors.primaryText }]}>
                {messages.captureFailed}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel={messages.capture}
              accessibilityRole="button"
              disabled={busy}
              testID="evidence-capture"
              onPress={() => void capture()}
              style={[
                styles.captureButton,
                {
                  backgroundColor: colors.primaryText,
                  borderColor: colors.surfaceMuted,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
            />
          </View>
        </View>
      ) : (
        <View style={styles.fill}>
          <Image source={{ uri: captured.uri }} resizeMode="contain" style={styles.reviewImage} />
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              testID="evidence-close"
              onPress={() => void close()}
              style={[styles.roundAction, { backgroundColor: colors.overlay }]}
            >
              <Text style={[styles.closeLabel, { color: colors.primaryText }]}>
                {messages.close}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.reviewActions, { backgroundColor: colors.surface }]}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              testID="evidence-retake"
              onPress={() => void retake()}
              style={[styles.reviewButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>
                {messages.retake}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              testID="evidence-submit"
              onPress={() => void submit()}
              style={[styles.reviewButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.actionText, { color: colors.primaryText }]}>
                {messages.submit}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  permission: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  permissionAction: {
    alignItems: 'center',
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  closeTextAction: {
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  topBar: {
    left: 16,
    position: 'absolute',
    right: 16,
    top: 20,
  },
  roundAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 22,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  closeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  captureBar: {
    alignItems: 'center',
    bottom: 36,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  captureButton: {
    borderRadius: 39,
    borderWidth: 5,
    height: 78,
    width: 78,
  },
  captureError: {
    fontSize: 14,
    marginBottom: 14,
  },
  reviewImage: {
    flex: 1,
    width: '100%',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  reviewButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
  },
});
