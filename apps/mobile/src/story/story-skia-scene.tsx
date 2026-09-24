import {
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Text as SkiaText,
  matchFont,
  type SkImage,
} from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import type { StoryComposition, StoryTextLayer } from './story-composition.js';

function contrastMatrix(amount: number): number[] {
  const factor = Math.max(0, 1 + amount);
  const offset = 128 * (1 - factor);
  return [factor, 0, 0, 0, offset, 0, factor, 0, 0, offset, 0, 0, factor, 0, offset, 0, 0, 0, 1, 0];
}

function fontFor(layer: StoryTextLayer) {
  return matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
    fontSize: layer.fontSize,
    fontWeight: layer.fontCategory.includes('bold') ? 'bold' : 'normal',
  });
}

function StoryText({ layer }: Readonly<{ layer: StoryTextLayer | null }>) {
  if (layer === null) return null;
  return (
    <SkiaText
      color={layer.color}
      font={fontFor(layer)}
      text={layer.text}
      x={layer.x}
      y={layer.y + layer.fontSize}
    />
  );
}

export function StorySkiaScene({
  composition,
  image,
  scale = 1,
}: Readonly<{
  composition: StoryComposition;
  image: SkImage | null;
  scale?: number;
}>) {
  const contrast = composition.effects.find((effect) => effect.kind === 'contrast');
  const contrastAmount =
    contrast !== undefined && typeof contrast.amount === 'number' ? contrast.amount : null;

  return (
    <Group transform={[{ scale }]}>
      <Group
        origin={{ x: 540, y: 960 }}
        transform={[
          { translateX: composition.background.translateX },
          { translateY: composition.background.translateY },
          { scale: composition.background.scale },
          { rotate: composition.background.rotation },
        ]}
      >
        {image === null ? null : (
          <SkiaImage image={image} fit="cover" x={0} y={0} width={1080} height={1920}>
            {contrastAmount === null ? null : (
              <ColorMatrix matrix={contrastMatrix(contrastAmount)} />
            )}
          </SkiaImage>
        )}
      </Group>
      <StoryText layer={composition.headline} />
      <StoryText layer={composition.supportingText} />
    </Group>
  );
}
