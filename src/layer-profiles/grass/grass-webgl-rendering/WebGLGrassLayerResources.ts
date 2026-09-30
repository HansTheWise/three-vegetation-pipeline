import {
  Color,
  DataTexture,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGFormat,
  RGBAFormat,
  UnsignedByteType,
  type WebGLRenderer,
} from 'three';

import type { VegetationLayer } from '../../../runtime/dataset-preparation/dataset-construction/PreparedVegetationDataset.js';
import type { VegetationPatternSet } from '../../reusable-profile-features/deterministic-pattern-generation/VegetationPatternTypes.js';
import {
  requireGrassRuntimeLayer,
  type GrassRuntimeLayer,
} from '../grass-layer-preparation/GrassLayerPreparation.js';

export type WebGLColorPaletteResource = Readonly<{
  colorCount: number;
  texture: DataTexture;
}>;

export type WebGLGrassPatternResource = Readonly<{
  patternSet: VegetationPatternSet;
  rotatePerCell: boolean;
  reflectPerCell: boolean;
  texture: DataTexture;
  bottomColors: WebGLColorPaletteResource;
  topColors: WebGLColorPaletteResource;
}>;

export type WebGLGrassGroundPatchFieldResource = Readonly<{
  texture: DataTexture;
}>;

export type WebGLGrassCloverTextureResource = Readonly<{
  texture: DataTexture;
}>;

/** Owns immutable GPU resources used only by one Grass layer renderer. */
export class WebGLGrassLayerResources {
  readonly vegetationLayerId: number;
  readonly pattern: WebGLGrassPatternResource;
  readonly groundPatchField: WebGLGrassGroundPatchFieldResource | undefined;
  readonly cloverTexture: WebGLGrassCloverTextureResource | undefined;
  readonly #ownedTextures: readonly DataTexture[];

  constructor(renderer: WebGLRenderer, layer: VegetationLayer) {
    const grassLayer = requireGrassRuntimeLayer(layer);
    const profile = grassLayer.config.renderProfile;
    const field = grassLayer.preparedProfileData.groundPatchField;
    const patterns = grassLayer.preparedProfileData.patterns;
    validateTextureDimensions(
      renderer,
      patterns.anchorsPerPattern,
      patterns.patternCount,
      `vegetation/layer-${layer.vegetationLayerId}-patterns`,
    );
    validateTextureDimensions(
      renderer,
      profile.colors.bottomColors.length,
      1,
      `vegetation/layer-${layer.vegetationLayerId}-bottom-colors`,
    );
    validateTextureDimensions(
      renderer,
      profile.colors.topColors.length,
      1,
      `vegetation/layer-${layer.vegetationLayerId}-top-colors`,
    );
    if (field) {
      validateTextureDimensions(
        renderer,
        field.width,
        field.height,
        `vegetation/layer-${layer.vegetationLayerId}-patch-field`,
      );
    }

    this.vegetationLayerId = layer.vegetationLayerId;
    const ownedTextures: DataTexture[] = [];
    try {
      this.pattern = {
        patternSet: patterns,
        rotatePerCell: grassLayer.config.pattern.rotatePerCell,
        reflectPerCell: grassLayer.config.pattern.reflectPerCell,
        texture: createUploadedDataTexture(
          renderer,
          patterns.anchorPositions,
          patterns.anchorsPerPattern,
          patterns.patternCount,
          RGFormat,
          FloatType,
          `vegetation/layer-${layer.vegetationLayerId}-patterns`,
          ownedTextures,
        ),
        bottomColors: createColorPaletteResource(
          renderer,
          profile.colors.bottomColors,
          `vegetation/layer-${layer.vegetationLayerId}-bottom-colors`,
          ownedTextures,
        ),
        topColors: createColorPaletteResource(
          renderer,
          profile.colors.topColors,
          `vegetation/layer-${layer.vegetationLayerId}-top-colors`,
          ownedTextures,
        ),
      };
      this.groundPatchField = field
        ? { texture: createGroundPatchFieldTexture(renderer, grassLayer, ownedTextures) }
        : undefined;
      this.cloverTexture = profile.clover?.enabled
        ? { texture: createCloverTexture(renderer, layer.vegetationLayerId, ownedTextures) }
        : undefined;
    } catch (error) {
      disposeTextures(ownedTextures);
      throw error;
    }
    this.#ownedTextures = ownedTextures;
  }

  dispose(): void {
    disposeTextures(this.#ownedTextures);
  }
}

function createColorPaletteResource(
  renderer: WebGLRenderer,
  colors: readonly string[],
  name: string,
  ownedTextures: DataTexture[],
): WebGLColorPaletteResource {
  const data = new Float32Array(colors.length * 4);
  colors.forEach((value, index) => {
    const color = new Color(value);
    const offset = index * 4;
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = 1;
  });
  return {
    colorCount: colors.length,
    texture: createUploadedDataTexture(
      renderer,
      data,
      colors.length,
      1,
      RGBAFormat,
      FloatType,
      name,
      ownedTextures,
    ),
  };
}

function createGroundPatchFieldTexture(
  renderer: WebGLRenderer,
  layer: GrassRuntimeLayer,
  ownedTextures: DataTexture[],
): DataTexture {
  const field = layer.preparedProfileData.groundPatchField!;
  const texture = new DataTexture(
    field.data,
    field.width,
    field.height,
    RGFormat,
    UnsignedByteType,
  );
  ownedTextures.push(texture);
  texture.name = `vegetation/layer-${layer.vegetationLayerId}-patch-field`;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  return texture;
}

const CLOVER_TEXTURE_SIZE = 64;
const CLOVER_TEXTURE_SUPERSAMPLING = 4;
const CLOVER_LEAF_DIRECTIONS = [
  [0, 1],
  [-Math.sqrt(3) / 2, -0.5],
  [Math.sqrt(3) / 2, -0.5],
] as const;

function createCloverTexture(
  renderer: WebGLRenderer,
  vegetationLayerId: number,
  ownedTextures: DataTexture[],
): DataTexture {
  const texture = new DataTexture(
    createCloverTextureData(),
    CLOVER_TEXTURE_SIZE,
    CLOVER_TEXTURE_SIZE,
    RGFormat,
    UnsignedByteType,
  );
  ownedTextures.push(texture);
  texture.name = `vegetation/layer-${vegetationLayerId}-clover`;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  return texture;
}

function createCloverTextureData(): Uint8Array {
  const data = new Uint8Array(CLOVER_TEXTURE_SIZE * CLOVER_TEXTURE_SIZE * 2);
  const sampleCount = CLOVER_TEXTURE_SUPERSAMPLING ** 2;
  for (let y = 0; y < CLOVER_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < CLOVER_TEXTURE_SIZE; x += 1) {
      let coverage = 0;
      let highlight = 0;
      for (let sampleY = 0; sampleY < CLOVER_TEXTURE_SUPERSAMPLING; sampleY += 1) {
        for (let sampleX = 0; sampleX < CLOVER_TEXTURE_SUPERSAMPLING; sampleX += 1) {
          const value = sampleCloverTexture(
            (x + (sampleX + 0.5) / CLOVER_TEXTURE_SUPERSAMPLING) / CLOVER_TEXTURE_SIZE,
            (y + (sampleY + 0.5) / CLOVER_TEXTURE_SUPERSAMPLING) / CLOVER_TEXTURE_SIZE,
          );
          coverage += value.coverage;
          highlight += value.highlight;
        }
      }
      const offset = (y * CLOVER_TEXTURE_SIZE + x) * 2;
      data[offset] = Math.round(coverage / sampleCount * 255);
      data[offset + 1] = Math.round(highlight / sampleCount * 255);
    }
  }
  return data;
}

function sampleCloverTexture(
  x: number,
  y: number,
): Readonly<{ coverage: number; highlight: number }> {
  const deltaX = x - 0.5;
  const deltaY = y - 0.43;
  for (const [directionX, directionY] of CLOVER_LEAF_DIRECTIONS) {
    const along = deltaX * directionX + deltaY * directionY;
    if (along <= 0 || along >= 0.42) continue;
    const across = deltaX * -directionY + deltaY * directionX;
    const ratio = along / 0.42;
    const halfWidth = 0.18 * Math.sin(Math.PI * ratio) ** 0.7;
    if (Math.abs(across) > halfWidth) continue;
    const highlight = distanceToSegmentSquared(
      along,
      across,
      0.14,
      0,
      0.27,
      0.065,
    ) < 0.00032 || distanceToSegmentSquared(
      along,
      across,
      0.14,
      0,
      0.27,
      -0.065,
    ) < 0.00032;
    return { coverage: 1, highlight: highlight ? 1 : 0 };
  }
  return { coverage: 0, highlight: 0 };
}

function distanceToSegmentSquared(
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const ratio = Math.max(0, Math.min(
    1,
    ((x - startX) * segmentX + (y - startY) * segmentY)
      / (segmentX * segmentX + segmentY * segmentY),
  ));
  const offsetX = x - (startX + segmentX * ratio);
  const offsetY = y - (startY + segmentY * ratio);
  return offsetX * offsetX + offsetY * offsetY;
}

function createUploadedDataTexture(
  renderer: WebGLRenderer,
  data: Float32Array,
  width: number,
  height: number,
  format: typeof RGFormat | typeof RGBAFormat,
  type: typeof FloatType,
  name: string,
  ownedTextures: DataTexture[],
): DataTexture {
  const texture = new DataTexture(data, width, height, format, type);
  ownedTextures.push(texture);
  texture.name = name;
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  return texture;
}

function validateTextureDimensions(
  renderer: WebGLRenderer,
  width: number,
  height: number,
  name: string,
): void {
  const maximumSize = renderer.capabilities.maxTextureSize;
  if (width > maximumSize || height > maximumSize) {
    throw new Error(
      `${name} texture size ${width}x${height} exceeds WebGL maximum ${maximumSize}x${maximumSize}.`,
    );
  }
}

function disposeTextures(textures: readonly DataTexture[]): void {
  for (let index = textures.length - 1; index >= 0; index -= 1) {
    textures[index]!.dispose();
  }
}
