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

import type { VegetationRuntimeLayer } from '../../dataset/types.js';
import type { VegetationPatternSet } from '../../patterns/types.js';
import { requireGrassRenderProfile } from '../../profiles/grass/GrassRenderProfile.js';

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

/** Owns immutable GPU resources used only by one Grass layer renderer. */
export class WebGLGrassLayerResources {
  readonly layerId: number;
  readonly pattern: WebGLGrassPatternResource;
  readonly groundPatchField: WebGLGrassGroundPatchFieldResource | undefined;
  readonly #ownedTextures: readonly DataTexture[];

  constructor(renderer: WebGLRenderer, layer: VegetationRuntimeLayer) {
    const profile = requireGrassRenderProfile(layer.config);
    const field = layer.groundPatchField;
    validateTextureDimensions(
      renderer,
      layer.patterns.anchorsPerPattern,
      layer.patterns.patternCount,
      `vegetation/layer-${layer.layerId}-patterns`,
    );
    validateTextureDimensions(
      renderer,
      profile.colors.bottomColors.length,
      1,
      `vegetation/layer-${layer.layerId}-bottom-colors`,
    );
    validateTextureDimensions(
      renderer,
      profile.colors.topColors.length,
      1,
      `vegetation/layer-${layer.layerId}-top-colors`,
    );
    if (field) {
      validateTextureDimensions(
        renderer,
        field.width,
        field.height,
        `vegetation/layer-${layer.layerId}-patch-field`,
      );
    }

    this.layerId = layer.layerId;
    const ownedTextures: DataTexture[] = [];
    try {
      this.pattern = {
        patternSet: layer.patterns,
        rotatePerCell: layer.config.pattern.rotatePerCell,
        reflectPerCell: layer.config.pattern.reflectPerCell,
        texture: createUploadedDataTexture(
          renderer,
          layer.patterns.anchorPositions,
          layer.patterns.anchorsPerPattern,
          layer.patterns.patternCount,
          RGFormat,
          FloatType,
          `vegetation/layer-${layer.layerId}-patterns`,
          ownedTextures,
        ),
        bottomColors: createColorPaletteResource(
          renderer,
          profile.colors.bottomColors,
          `vegetation/layer-${layer.layerId}-bottom-colors`,
          ownedTextures,
        ),
        topColors: createColorPaletteResource(
          renderer,
          profile.colors.topColors,
          `vegetation/layer-${layer.layerId}-top-colors`,
          ownedTextures,
        ),
      };
      this.groundPatchField = field
        ? { texture: createGroundPatchFieldTexture(renderer, layer, ownedTextures) }
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
  layer: VegetationRuntimeLayer,
  ownedTextures: DataTexture[],
): DataTexture {
  const field = layer.groundPatchField!;
  const texture = new DataTexture(
    field.data,
    field.width,
    field.height,
    RGFormat,
    UnsignedByteType,
  );
  ownedTextures.push(texture);
  texture.name = `vegetation/layer-${layer.layerId}-patch-field`;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  return texture;
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
