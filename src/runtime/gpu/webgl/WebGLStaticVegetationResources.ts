import {
  DataTexture,
  FloatType,
  RedIntegerFormat,
  RGFormat,
  RGIntegerFormat,
  UnsignedByteType,
  UnsignedIntType,
  UnsignedShortType,
  type WebGLRenderer,
} from 'three';

import { createStoredChunkGridCoordinates } from '../StoredChunkGridCoordinates.js';
import type { VegetationRuntimeDataset } from '../../dataset/types.js';
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

/** Owns the immutable GPU data created from one parsed VEGFILE. */
export class WebGLStaticVegetationResources {
  readonly header: ParsedVegHeader;
  readonly storedChunkGridCoordinatesTexture: DataTexture;
  readonly chunkHeightRangesTexture: DataTexture;
  readonly heightDataTexture: DataTexture;
  readonly layerMasks: readonly WebGLLayerMaskResource[];
  readonly #ownedTextures: readonly DataTexture[];

  constructor(
    renderer: WebGLRenderer,
    dataset: VegetationRuntimeDataset,
  ) {
    const { file } = dataset;
    const { storedChunkCount, heightMap } = file.header;
    this.header = file.header;

    const ownedTextures: DataTexture[] = [];
    try {
      this.storedChunkGridCoordinatesTexture = createUploadedDataTexture(
        renderer,
        createStoredChunkGridCoordinates(file),
        storedChunkCount,
        1,
        RGIntegerFormat,
        UnsignedIntType,
        'vegetation/stored-chunk-grid-coordinates',
        ownedTextures,
      );
      this.chunkHeightRangesTexture = createUploadedDataTexture(
        renderer,
        file.chunkHeightRanges,
        storedChunkCount,
        1,
        RGFormat,
        FloatType,
        'vegetation/chunk-height-ranges',
        ownedTextures,
      );
      this.heightDataTexture = createUploadedDataTexture(
        renderer,
        file.heightData,
        heightMap.valuesPerChunk,
        storedChunkCount,
        RedIntegerFormat,
        readHeightTextureType(file.heightData),
        'vegetation/height-data',
        ownedTextures,
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
          ownedTextures,
        ),
      }));
    } catch (error) {
      for (let index = ownedTextures.length - 1; index >= 0; index -= 1) {
        ownedTextures[index]!.dispose();
      }
      throw error;
    }
    this.#ownedTextures = ownedTextures;
  }

  dispose(): void {
    for (let index = this.#ownedTextures.length - 1; index >= 0; index -= 1) {
      this.#ownedTextures[index]!.dispose();
    }
  }
}

function createUploadedDataTexture(
  renderer: WebGLRenderer,
  data: Uint8Array | Uint16Array | Uint32Array | Float32Array,
  width: number,
  height: number,
  format: typeof RedIntegerFormat | typeof RGFormat | typeof RGIntegerFormat,
  type: typeof UnsignedByteType | typeof UnsignedShortType | typeof UnsignedIntType | typeof FloatType,
  name: string,
  ownedTextures: DataTexture[],
): DataTexture {
  validateTextureDimensions(renderer, width, height, name);
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

function readHeightTextureType(
  heightData: QuantizedHeightData,
): typeof UnsignedByteType | typeof UnsignedShortType | typeof UnsignedIntType {
  if (heightData instanceof Uint8Array) return UnsignedByteType;
  if (heightData instanceof Uint16Array) return UnsignedShortType;
  return UnsignedIntType;
}
