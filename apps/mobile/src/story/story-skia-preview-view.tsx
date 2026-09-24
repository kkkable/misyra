import { Canvas, useImage } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';

import type { StoryComposition } from './story-composition.js';
import type { StorySourceImage } from './story-editor-state.js';
import { StorySkiaScene } from './story-skia-scene.js';
import { createStoryPreviewLayout } from './story-skia-preview.js';

export function StorySkiaPreviewView({
  availableWidth,
  sourceImage,
  composition,
}: Readonly<{
  availableWidth: number;
  sourceImage: StorySourceImage;
  composition: StoryComposition;
}>) {
  const layout = createStoryPreviewLayout(availableWidth);
  const image = useImage(sourceImage.uri);

  return (
    <View
      style={[
        styles.preview,
        {
          width: layout.displayWidth,
          height: layout.displayHeight,
        },
      ]}
    >
      <Canvas style={{ width: layout.displayWidth, height: layout.displayHeight }}>
        <StorySkiaScene composition={composition} image={image} scale={layout.scale} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    overflow: 'hidden',
  },
});
