import {
  FloatType,
  RedIntegerFormat,
  RGFormat,
  RGIntegerFormat,
  UnsignedByteType,
  UnsignedIntType,
  UnsignedShortType,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';

import {
  ChunkVisibilityManager,
  createStoredChunkGridCoordinateLookup,
  createPreparedVegetationDataset,
  grassLayerPreparation,
  WebGLVegetationDatasetTextures,
  WebGLVisibleRenderTileTexture,
  WebGLVisibleStoredChunkTexture,
  type ParsedVegFile,
  type QuantizedHeightData,
  type VegetationRuntimeConfig,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

type FakeRenderer = Readonly<{
  renderer: WebGLRenderer;
  initTexture: ReturnType<typeof vi.fn>;
}>;

function createRenderer(maxTextureSize = 4096): FakeRenderer {
  const initTexture = vi.fn();
  return {
    renderer: {
      capabilities: { maxTextureSize },
      initTexture,
    } as unknown as WebGLRenderer,
    initTexture,
  };
}

function createParsedFile(
  heightData: QuantizedHeightData = Uint16Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
): ParsedVegFile {
  const heightValueBits = heightData instanceof Uint8Array
    ? 8
    : heightData instanceof Uint16Array
      ? 16
      : 32;

  return {
    bytes: new Uint8Array(),
    header: {
      version: 2,
      vegetationSeed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 3,
        maxY: 2,
        maxZ: 6,
      },
      coordinateSystem: {
        upAxis: 'z',
        horizontalAxes: ['x', 'y'],
        unitsPerMeter: 1,
      },
      grid: {
        width: 3,
        height: 2,
        chunkSize: 1,
        originX: 0,
        originY: 0,
      },
      storedChunkCount: 2,
      heightMap: {
        resolutionPerChunkAxis: 2,
        valueBits: heightValueBits,
        valuesPerChunk: 4,
      },
    },
    chunkLookup: Int32Array.from([-1, 1, -1, 0, -1, -1]),
    chunkHeightRanges: Float32Array.from([2, 4, 5, 6]),
    heightData,
    layers: [
      {
        vegetationLayerId: 7,
        maskResolutionPerChunkAxis: 2,
        maskWordsPerChunk: 1,
        maskData: Uint32Array.from([0b1101, 0b0010]),
      },
      {
        vegetationLayerId: 9,
        maskResolutionPerChunkAxis: 8,
        maskWordsPerChunk: 2,
        maskData: Uint32Array.from([1, 2, 3, 4]),
      },
    ],
  };
}

function createRuntimeConfig(): VegetationRuntimeConfig {
  const layer = vegetationRuntimeConfig.layers[0]!;
  return {
    ...vegetationRuntimeConfig,
    layers: [
      { ...layer, vegetationLayerId: 7, vegetationLayerKey: 'layer-7' },
      { ...layer, vegetationLayerId: 9, vegetationLayerKey: 'layer-9', enabled: false },
    ],
  };
}

function createRuntimeDataset(
  heightData?: QuantizedHeightData,
) {
  return createPreparedVegetationDataset(
    createParsedFile(heightData),
    createRuntimeConfig(),
    [grassLayerPreparation],
  );
}

describe('createStoredChunkGridCoordinateLookup', () => {
  it('inverts logical chunk lookup entries into stored chunk grid coordinates', () => {
    const coordinateLookup = createStoredChunkGridCoordinateLookup(createParsedFile());

    expect([...coordinateLookup]).toEqual([0, 1, 1, 0]);
  });
});

describe('WebGLVegetationDatasetTextures', () => {
  it('uploads only immutable VEGFILE data shared by initialized layers', () => {
    const { renderer, initTexture } = createRenderer(4);
    const file = createParsedFile();
    const resources = new WebGLVegetationDatasetTextures(
      renderer,
      createPreparedVegetationDataset(file, createRuntimeConfig(), [grassLayerPreparation]),
    );

    expect(resources.storedChunkGridCoordinateLookupTexture.image).toMatchObject({
      width: 2,
      height: 1,
    });
    expect(resources.storedChunkGridCoordinateLookupTexture.image.data).toEqual(
      Uint32Array.from([0, 1, 1, 0]),
    );
    expect(resources.storedChunkGridCoordinateLookupTexture.format).toBe(RGIntegerFormat);
    expect(resources.storedChunkGridCoordinateLookupTexture.type).toBe(UnsignedIntType);

    expect(resources.chunkHeightRangesTexture.image.data).toBe(file.chunkHeightRanges);
    expect(resources.chunkHeightRangesTexture.format).toBe(RGFormat);
    expect(resources.chunkHeightRangesTexture.type).toBe(FloatType);

    expect(resources.heightDataTexture.image).toMatchObject({ width: 4, height: 2 });
    expect(resources.heightDataTexture.image.data).toBe(file.heightData);
    expect(resources.heightDataTexture.format).toBe(RedIntegerFormat);
    expect(resources.heightDataTexture.type).toBe(UnsignedShortType);

    expect(resources).not.toHaveProperty('layerMasks');
    expect(initTexture).toHaveBeenCalledTimes(3);
  });

  it.each([
    [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), UnsignedByteType],
    [Uint16Array.from([0, 1, 2, 3, 4, 5, 6, 7]), UnsignedShortType],
    [Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7]), UnsignedIntType],
  ] as const)('maps quantized height arrays to their WebGL integer type', (heightData, type) => {
    const { renderer } = createRenderer();
    const resources = new WebGLVegetationDatasetTextures(
      renderer,
      createRuntimeDataset(heightData),
    );

    expect(resources.heightDataTexture.type).toBe(type);
  });

  it('rejects static textures larger than the renderer supports', () => {
    const { renderer } = createRenderer(1);

    expect(() => new WebGLVegetationDatasetTextures(
      renderer,
      createRuntimeDataset(),
    )).toThrow('requires 2 texels, exceeding the WebGL capacity of 1x1');
  });
});

describe('WebGLVisibleStoredChunkTexture', () => {
  it('packs multiple rows and uploads only changed visible indices', () => {
    const { renderer, initTexture } = createRenderer(2);
    const visibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(renderer, 3);
    const data = visibleStoredChunkTexture.storedChunkIndexData;
    const texture = visibleStoredChunkTexture.texture;

    visibleStoredChunkTexture.update(Uint32Array.from([2, 0, 1]), 2);

    expect(visibleStoredChunkTexture.texture.image).toMatchObject({ width: 2, height: 2 });
    expect(visibleStoredChunkTexture.storedChunkIndexData).toBe(data);
    expect(visibleStoredChunkTexture.texture).toBe(texture);
    expect([...visibleStoredChunkTexture.storedChunkIndexData]).toEqual([2, 0, 0, 0]);
    expect(visibleStoredChunkTexture.visibleStoredChunkCount).toBe(2);
    expect(visibleStoredChunkTexture.selectionRevision).toBe(1);
    expect(initTexture).toHaveBeenCalledTimes(2);

    visibleStoredChunkTexture.update(Uint32Array.from([2, 0]), 2);
    expect(visibleStoredChunkTexture.selectionRevision).toBe(1);
    expect(initTexture).toHaveBeenCalledTimes(2);

    visibleStoredChunkTexture.update(Uint32Array.from([1]), 0);
    expect(visibleStoredChunkTexture.visibleStoredChunkCount).toBe(0);
    expect(visibleStoredChunkTexture.selectionRevision).toBe(2);
    expect(initTexture).toHaveBeenCalledTimes(2);
  });

  it('rejects a visible count outside its capacity', () => {
    const { renderer } = createRenderer();
    const visibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(renderer, 2);

    expect(() => visibleStoredChunkTexture.update(Uint32Array.from([0, 1, 2]), 3)).toThrow(
      'visibleStoredChunkCount 3 must fit both the source array and texture capacity 2.',
    );
  });
});

describe('ChunkVisibilityManager', () => {
  it('creates and disposes its visible stored-chunk texture', () => {
    const { renderer } = createRenderer();
    const chunkVisibilityManager = new ChunkVisibilityManager({
      renderer,
      vegetationDataset: createRuntimeDataset(),
    });
    const textureDisposed = vi.fn();
    chunkVisibilityManager.visibleStoredChunkTexture.texture.addEventListener(
      'dispose',
      textureDisposed,
    );

    chunkVisibilityManager.dispose();

    expect(textureDisposed).toHaveBeenCalledOnce();
  });
});

describe('WebGLVisibleRenderTileTexture', () => {
  it('uploads reusable RGBA density records only when the used prefix changes', () => {
    const { renderer, initTexture } = createRenderer(2);
    const visibleRenderTileTexture = new WebGLVisibleRenderTileTexture(
      renderer,
      3,
      'test/tiles',
    );
    const records = Uint32Array.from([
      7, 11, 13, 17,
      9, 19, 23, 29,
    ]);

    visibleRenderTileTexture.update(records, 2);

    expect(visibleRenderTileTexture.texture.image).toMatchObject({ width: 2, height: 2 });
    expect([...visibleRenderTileTexture.renderTileRecordData.slice(0, 8)])
      .toEqual([7, 11, 13, 17, 9, 19, 23, 29]);
    expect(visibleRenderTileTexture.visibleRenderTileCount).toBe(2);
    expect(initTexture).toHaveBeenCalledTimes(2);

    visibleRenderTileTexture.update(records, 2);
    visibleRenderTileTexture.update(records, 1);
    expect(visibleRenderTileTexture.visibleRenderTileCount).toBe(1);
    expect(initTexture).toHaveBeenCalledTimes(2);

    visibleRenderTileTexture.update(Uint32Array.from([8, 11, 13, 17]), 1);
    expect(initTexture).toHaveBeenCalledTimes(3);
  });
});
