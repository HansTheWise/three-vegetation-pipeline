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

import type { QuantizedHeightData } from '../../shared/vegfile-parsing/ParsedVegFileTypes.js';
import type { PreparedVegetationDataset } from '../dataset-preparation/dataset-construction/PreparedVegetationDataset.js';
import {
  calculateWebGLDataTextureLayout,
  padWebGLDataTextureArray,
  type WebGLDataTextureArray,
} from '../webgl-data-texture-layout/WebGLDataTextureLayout.js';

/** Owns immutable VEGFILE textures shared by every initialized layer. */
export class WebGLVegetationDatasetTextures {
  readonly storedChunkGridCoordinateLookupTexture: DataTexture;
  readonly chunkHeightRangesTexture: DataTexture;
  readonly heightDataTexture: DataTexture;
  readonly #ownedTextures: readonly DataTexture[];

  constructor(renderer: WebGLRenderer, dataset: PreparedVegetationDataset) {
    const { file } = dataset;
    const { storedChunkCount, heightMap } = file.header;
    const ownedTextures: DataTexture[] = [];
    try {
      this.storedChunkGridCoordinateLookupTexture = createUploadedDataTexture(
        renderer,
        dataset.storedChunkGridCoordinateLookup,
        storedChunkCount,
        2,
        RGIntegerFormat,
        UnsignedIntType,
        'vegetation/stored-chunk-grid-coordinate-lookup',
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
