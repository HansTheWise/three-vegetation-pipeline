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

import type { VegetationRuntimeDataset } from '../../runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import type { QuantizedHeightData } from '../../vegfile-v2-parsing/ParsedVegetationFile.js';
import {
  calculateWebGLDataTextureLayout,
  padWebGLDataTextureArray,
  type WebGLDataTextureArray,
} from '../data-texture-layout/WebGLDataTextureLayout.js';

/** Owns immutable VEGFILE textures shared by every initialized layer. */
export class WebGLSharedVegFileTextures {
  readonly storedChunkGridCoordinatesTexture: DataTexture;
  readonly chunkHeightRangesTexture: DataTexture;
  readonly heightDataTexture: DataTexture;
  readonly #ownedTextures: readonly DataTexture[];

  constructor(renderer: WebGLRenderer, dataset: VegetationRuntimeDataset) {
    const { file } = dataset;
    const { storedChunkCount, heightMap } = file.header;
    const ownedTextures: DataTexture[] = [];
    try {
      this.storedChunkGridCoordinatesTexture = createUploadedDataTexture(
        renderer,
        dataset.storedChunkGridCoordinates,
        storedChunkCount,
        2,
        RGIntegerFormat,
        UnsignedIntType,
        'vegetation/stored-chunk-grid-coordinates',
        ownedTextures,
      );
      this.chunkHeightRangesTexture = createUploadedDataTexture(
        renderer,
        file.chunkHeightRanges,
        storedChunkCount,
        2,
        RGFormat,
        FloatType,
        'vegetation/chunk-height-ranges',
        ownedTextures,
      );
      this.heightDataTexture = createUploadedDataTexture(
        renderer,
        file.heightData,
        heightMap.valuesPerChunk * storedChunkCount,
        1,
        RedIntegerFormat,
        readHeightTextureType(file.heightData),
        'vegetation/height-data',
        ownedTextures,
      );
    } catch (error) {
      disposeTexturesInReverseOrder(ownedTextures);
      throw error;
    }
    this.#ownedTextures = ownedTextures;
  }

  dispose(): void {
    disposeTexturesInReverseOrder(this.#ownedTextures);
  }
}

function createUploadedDataTexture(
  renderer: WebGLRenderer,
  data: WebGLDataTextureArray,
  texelCount: number,
  valuesPerTexel: number,
  format: typeof RedIntegerFormat | typeof RGFormat | typeof RGIntegerFormat,
  type: typeof UnsignedByteType | typeof UnsignedShortType | typeof UnsignedIntType | typeof FloatType,
  name: string,
  ownedTextures: DataTexture[],
): DataTexture {
  const layout = calculateWebGLDataTextureLayout(
    texelCount,
    renderer.capabilities.maxTextureSize,
    name,
  );
  const textureData = padWebGLDataTextureArray(
    data,
    layout.texelCapacity * valuesPerTexel,
  );
  const texture = new DataTexture(textureData, layout.width, layout.height, format, type);
  ownedTextures.push(texture);
  texture.name = name;
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  return texture;
}

function readHeightTextureType(
  heightData: QuantizedHeightData,
): typeof UnsignedByteType | typeof UnsignedShortType | typeof UnsignedIntType {
  if (heightData instanceof Uint8Array) return UnsignedByteType;
  if (heightData instanceof Uint16Array) return UnsignedShortType;
  return UnsignedIntType;
}

function disposeTexturesInReverseOrder(textures: readonly DataTexture[]): void {
  for (let textureIndex = textures.length - 1; textureIndex >= 0; textureIndex -= 1) {
    textures[textureIndex]!.dispose();
  }
}
