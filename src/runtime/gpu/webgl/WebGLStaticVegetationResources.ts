import {
  Color,
  DataTexture,
  FloatType,
  RedIntegerFormat,
  RGFormat,
  RGIntegerFormat,
  RGBAFormat,
  UnsignedByteType,
  UnsignedIntType,
  UnsignedShortType,
  type WebGLRenderer,
} from 'three';

import { createStoredChunkGridCoordinates } from '../StoredChunkGridCoordinates.js';
import type { VegetationRuntimeDataset } from '../../dataset/types.js';
import type { VegetationPatternSet } from '../../patterns/types.js';
import type {
  ParsedVegHeader,
  QuantizedHeightData,
} from '../../parser/types.js';

export type WebGLLayerMaskResource = Readonly<{
  layerId: number;
  maskResolution: number;
  maskWordsPerChunk: number;
  texture: DataTexture;
}>;

export type WebGLPatternResource = Readonly<{
  layerId: number;
  patternSet: VegetationPatternSet;
  rotatePerCell: boolean;
  reflectPerCell: boolean;
  texture: DataTexture;
  bottomColors: WebGLColorPaletteResource;
  topColors: WebGLColorPaletteResource;
}>;

export type WebGLColorPaletteResource = Readonly<{
  colorCount: number;
  texture: DataTexture;
}>;

/** Owns the immutable GPU data created from one parsed VEGFILE. */
export class WebGLStaticVegetationResources {
  readonly header: ParsedVegHeader;
  readonly storedChunkGridCoordinatesTexture: DataTexture;
  readonly chunkHeightRangesTexture: DataTexture;
  readonly heightDataTexture: DataTexture;
  readonly layerMasks: readonly WebGLLayerMaskResource[];
  readonly patterns: readonly WebGLPatternResource[];

  constructor(
    renderer: WebGLRenderer,
    dataset: VegetationRuntimeDataset,
  ) {
    const { file } = dataset;
    const { storedChunkCount, heightMap } = file.header;
    this.header = file.header;

    this.storedChunkGridCoordinatesTexture = createUploadedDataTexture(
      renderer,
      createStoredChunkGridCoordinates(file),
      storedChunkCount,
      1,
      RGIntegerFormat,
      UnsignedIntType,
      'vegetation/stored-chunk-grid-coordinates',
    );
    this.chunkHeightRangesTexture = createUploadedDataTexture(
      renderer,
      file.chunkHeightRanges,
      storedChunkCount,
      1,
      RGFormat,
      FloatType,
      'vegetation/chunk-height-ranges',
    );
    this.heightDataTexture = createUploadedDataTexture(
      renderer,
      file.heightData,
      heightMap.valuesPerChunk,
      storedChunkCount,
      RedIntegerFormat,
      readHeightTextureType(file.heightData),
      'vegetation/height-data',
    );
    this.layerMasks = file.layers.map((layer) => ({
      layerId: layer.id,
      maskResolution: layer.maskResolution,
      maskWordsPerChunk: layer.maskWordsPerChunk,
      texture: createUploadedDataTexture(
        renderer,
        layer.maskData,
        layer.maskWordsPerChunk,
        storedChunkCount,
        RedIntegerFormat,
        UnsignedIntType,
        `vegetation/layer-${layer.id}-mask`,
      ),
    }));
    this.patterns = createPatternResources(renderer, dataset);
  }

  dispose(): void {
    this.storedChunkGridCoordinatesTexture.dispose();
    this.chunkHeightRangesTexture.dispose();
    this.heightDataTexture.dispose();
    for (const layer of this.layerMasks) layer.texture.dispose();
    for (const pattern of this.patterns) {
      pattern.texture.dispose();
      pattern.bottomColors.texture.dispose();
      pattern.topColors.texture.dispose();
    }
  }
}

function createPatternResources(
  renderer: WebGLRenderer,
  dataset: VegetationRuntimeDataset,
): WebGLPatternResource[] {
  return dataset.enabledLayers
    .map((layer) => {
      const patternSet = layer.patterns;
      return {
        layerId: layer.layerId,
        patternSet,
        rotatePerCell: layer.config.pattern.rotatePerCell,
        reflectPerCell: layer.config.pattern.reflectPerCell,
        texture: createUploadedDataTexture(
          renderer,
          patternSet.anchorPositions,
          patternSet.anchorsPerPattern,
          patternSet.patternCount,
          RGFormat,
          FloatType,
          `vegetation/layer-${layer.layerId}-patterns`,
        ),
        bottomColors: createColorPaletteResource(
          renderer,
          layer.config.colors.bottomColors,
          `vegetation/layer-${layer.layerId}-bottom-colors`,
        ),
        topColors: createColorPaletteResource(
          renderer,
          layer.config.colors.topColors,
          `vegetation/layer-${layer.layerId}-top-colors`,
        ),
      };
    });
}

function createColorPaletteResource(
  renderer: WebGLRenderer,
  colors: readonly string[],
  name: string,
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
    ),
  };
}

function createUploadedDataTexture(
  renderer: WebGLRenderer,
  data: Uint8Array | Uint16Array | Uint32Array | Float32Array,
  width: number,
  height: number,
  format: typeof RedIntegerFormat | typeof RGFormat | typeof RGIntegerFormat | typeof RGBAFormat,
  type: typeof UnsignedByteType | typeof UnsignedShortType | typeof UnsignedIntType | typeof FloatType,
  name: string,
): DataTexture {
  validateTextureDimensions(renderer, width, height, name);
  const texture = new DataTexture(data, width, height, format, type);
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

function readHeightTextureType(
  heightData: QuantizedHeightData,
): typeof UnsignedByteType | typeof UnsignedShortType | typeof UnsignedIntType {
  if (heightData instanceof Uint8Array) return UnsignedByteType;
  if (heightData instanceof Uint16Array) return UnsignedShortType;
  return UnsignedIntType;
}
