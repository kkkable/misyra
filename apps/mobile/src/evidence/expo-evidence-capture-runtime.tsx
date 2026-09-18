import {
  CameraView,
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Linking, StyleSheet } from 'react-native';

import type {
  EvidenceCaptureRuntime,
  EvidencePermissionStatus,
} from './evidence-capture-screen.js';

function permissionStatus(status: string): EvidencePermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  if (status === 'denied') return 'denied';
  return 'unavailable';
}

function protectedEvidenceDirectory(): string {
  const root = FileSystem.documentDirectory;
  if (root === null) {
    throw new Error('Protected app document storage is unavailable.');
  }
  return `${root}misyra/evidence-working/`;
}

function protectedFileName(sourceUri: string): string {
  const sourceName = sourceUri.split('/').at(-1);
  const safeSourceName =
    sourceName === undefined || sourceName.length === 0
      ? 'evidence.jpg'
      : sourceName.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${Date.now()}-${safeSourceName}`;
}

export function createExpoEvidenceCaptureRuntime(): EvidenceCaptureRuntime {
  let camera: CameraView | null = null;

  function Preview({ active }: Readonly<{ active: boolean }>) {
    return (
      <CameraView
        ref={(instance) => {
          camera = instance;
        }}
        active={active}
        facing="back"
        mode="picture"
        style={styles.preview}
      />
    );
  }

  return {
    permission: {
      async getStatus() {
        const response = await getCameraPermissionsAsync();
        return permissionStatus(response.status);
      },
      async request() {
        const response = await requestCameraPermissionsAsync();
        return permissionStatus(response.status);
      },
      async openSettings() {
        await Linking.openSettings();
      },
      subscribeToAppActive(listener) {
        const subscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') listener();
        });
        return () => {
          subscription.remove();
        };
      },
    },
    camera: {
      Preview,
      async capture() {
        if (camera === null) throw new Error('Camera preview is not ready.');
        const picture = await camera.takePictureAsync({
          quality: 1,
          skipProcessing: true,
        });
        if (picture?.uri === undefined || picture.uri.length === 0) {
          throw new Error('Camera did not return an evidence image.');
        }
        return { uri: picture.uri };
      },
    },
    files: {
      async protectOriginal(sourceUri) {
        const directory = protectedEvidenceDirectory();
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const uri = `${directory}${protectedFileName(sourceUri)}`;
        await FileSystem.moveAsync({ from: sourceUri, to: uri });
        return { uri };
      },
      async discard(uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      },
    },
  };
}

const styles = StyleSheet.create({
  preview: {
    flex: 1,
  },
});
