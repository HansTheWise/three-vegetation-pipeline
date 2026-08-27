import {
  FloatType,
  RedIntegerFormat,
  RGFormat,
  RGIntegerFormat,
  UnsignedByteType,
  UnsignedIntType,
  UnsignedShortType,
  type DataTexture,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';

import {
  createStoredChunkGridCoordinates,
  createVegetationRuntimeDataset,
  WebGLStaticVegetationResources,
  WebGLVegetationAdapter,
  WebGLVisibleChunkBuffer,
  WebGLVisibleTileBuffer,
  type ParsedVegFile,
  type QuantizedHeightData,
  type VegetationRuntimeConfig,
} from '../src/index.js';

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
      version: 1,
      fileSize: 0,
      seed: 42,
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
        resolution: 2,
        valueBits: heightValueBits,
        valuesPerChunk: 4,
      },
    },
    chunkLookup: Int32Array.from([-1, 1, -1, 0, -1, -1]),
    chunkHeightRanges: Float32Array.from([2, 4, 5, 6]),
    heightData,
    layers: [
      {
        id: 7,
        maskResolution: 2,
        maskWordsPerChunk: 1,
        maskData: Uint32Array.from([0b1101, 0b0010]),
      },
      {
        id: 9,
        maskResolution: 8,
        maskWordsPerChunk: 2,
        maskData: Uint32Array.from([1, 2, 3, 4]),
      },
    ],
  };
}

function createRuntimeConfig(): VegetationRuntimeConfig {
  const layer = icakaVegetationRuntimeConfig.layers[0]!;
  return {
    ...icakaVegetationRuntimeConfig,
    layers: [
      { ...layer, layerId: 7, key: 'layer-7' },
      { ...layer, layerId: 9, key: 'layer-9', enabled: false },
    ],
  };
}

function createRuntimeDataset(
  heightData?: QuantizedHeightData,
) {
  return createVegetationRuntimeDataset(
    createParsedFile(heightData),
    createRuntimeConfig(),
  );
}

describe('createStoredChunkGridCoordinates', () => {
  it('inverts logical chunk lookup entries into stored chunk grid coordinates', () => {
    const coordinates = createStoredChunkGridCoordinates(createParsedFile());

    expect([...coordinates]).toEqual([0, 1, 1, 0]);
  });
});

describe('WebGLStaticVegetationResources', () => {
  it('uploads static chunk, height, and layer data with explicit texture layouts', () => {
    const { renderer, initTexture } = createRenderer();
    const file = createParsedFile();
    const resources = new WebGLStaticVegetationResources(
      renderer,
      createVegetationRuntimeDataset(file, createRuntimeConfig()),
    );

    expect(resources.header).toBe(file.header);
    expect(resources.storedChunkGridCoordinatesTexture.image).toMatchObject({
      width: 2,
      height: 1,
    });
    expect(resources.storedChunkGridCoordinatesTexture.image.data).toEqual(
      Uint32Array.from([0, 1, 1, 0]),
    );
    expect(resources.storedChunkGridCoordinatesTexture.format).toBe(RGIntegerFormat);
    expect(resources.storedChunkGridCoordinatesTexture.type).toBe(UnsignedIntType);

    expect(resources.chunkHeightRangesTexture.image.data).toBe(file.chunkHeightRanges);
    expect(resources.chunkHeightRangesTexture.format).toBe(RGFormat);
    expect(resources.chunkHeightRangesTexture.type).toBe(FloatType);

    expect(resources.heightDataTexture.image).toMatchObject({ width: 4, height: 2 });
    expect(resources.heightDataTexture.image.data).toBe(file.heightData);
    expect(resources.heightDataTexture.format).toBe(RedIntegerFormat);
    expect(resources.heightDataTexture.type).toBe(UnsignedShortType);

    expect(resources.layerMasks).toHaveLength(2);
    expect(resources.layerMasks[0]).toMatchObject({
      layerId: 7,
      maskResolution: 2,
      maskWordsPerChunk: 1,
    });
    expect(resources.layerMasks[0]!.texture.image).toMatchObject({ width: 1, height: 2 });
    expect(resources.layerMasks[0]!.texture.image.data).toBe(file.layers[0]!.maskData);
    expect(resources.layerMasks[1]!.texture.image).toMatchObject({ width: 2, height: 2 });
    expect(initTexture).toHaveBeenCalledTimes(8);
  });

  it.each([
    [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), UnsignedByteType],
    [Uint16Array.from([0, 1, 2, 3, 4, 5, 6, 7]), UnsignedShortType],
    [Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7]), UnsignedIntType],
  ] as const)('maps quantized height arrays to their WebGL integer type', (heightData, type) => {
    const { renderer } = createRenderer();
    const resources = new WebGLStaticVegetationResources(
      renderer,
      createRuntimeDataset(heightData),
    );

    expect(resources.heightDataTexture.type).toBe(type);
  });

  it('uploads deterministic pattern anchors once for configured layers', () => {
    const { renderer, initTexture } = createRenderer();
    const resources = new WebGLStaticVegetationResources(
      renderer,
      createRuntimeDataset(),
    );

    expect(resources.patterns).toHaveLength(1);
    expect(resources.patterns[0]).toMatchObject({
      layerId: 7,
      rotatePerCell: true,
      reflectPerCell: true,
    });
    expect(resources.patterns[0]!.patternSet.lodAnchorCounts).toEqual(
      Uint32Array.from([4, 3, 2, 1, 1, 1, 1, 1]),
    );
    const colors = icakaVegetationRuntimeConfig.layers[0]!.colors;
    expect(resources.patterns[0]!.texture.image).toMatchObject({ width: 4, height: 4 });
    expect(resources.patterns[0]!.bottomColors)
      .toMatchObject({ colorCount: colors.bottomColors.length });
    expect(resources.patterns[0]!.bottomColors.texture.image)
      .toMatchObject({ width: colors.bottomColors.length, height: 1 });
    expect(resources.patterns[0]!.topColors)
      .toMatchObject({ colorCount: colors.topColors.length });
    expect(resources.patterns[0]!.topColors.texture.image)
      .toMatchObject({ width: colors.topColors.length, height: 1 });
    expect(initTexture).toHaveBeenCalledTimes(8);
  });

  it('rejects static textures larger than the renderer supports', () => {
    const { renderer } = createRenderer(1);

    expect(() => new WebGLStaticVegetationResources(
      renderer,
      createRuntimeDataset(),
    )).toThrow('texture size 2x1 exceeds WebGL maximum 1x1');
  });
});

describe('WebGLVisibleChunkBuffer', () => {
  it('reuses its CPU array and GPU texture while updating visible indices', () => {
    const { renderer, initTexture } = createRenderer();
    const buffer = new WebGLVisibleChunkBuffer(renderer, 3);
    const data = buffer.data;
    const texture = buffer.texture;

    buffer.update(Uint32Array.from([2, 0, 1]), 2);

    expect(buffer.data).toBe(data);
    expect(buffer.texture).toBe(texture);
    expect([...buffer.data]).toEqual([2, 0, 0]);
    expect(buffer.visibleChunkCount).toBe(2);
    expect(initTexture).toHaveBeenCalledTimes(2);

    buffer.update(Uint32Array.from([1]), 0);
    expect(buffer.visibleChunkCount).toBe(0);
    expect(initTexture).toHaveBeenCalledTimes(2);
  });

  it('rejects a visible count outside its capacity', () => {
    const { renderer } = createRenderer();
    const buffer = new WebGLVisibleChunkBuffer(renderer, 2);

    expect(() => buffer.update(Uint32Array.from([0, 1, 2]), 3)).toThrow(
      'visibleChunkCount 3 must fit both the source array and buffer capacity 2.',
    );
  });
});

describe('WebGLVisibleTileBuffer', () => {
  it('packs chunk and tile coordinates into reusable RGBA texels', () => {
    const { renderer, initTexture } = createRenderer(2);
    const buffer = new WebGLVisibleTileBuffer(renderer, 3, 'test/tiles');

    buffer.update(Uint32Array.from([
      7, 1, 2,
      9, 3, 4,
    ]), 2);

    expect(buffer.texture.image).toMatchObject({ width: 2, height: 2 });
    expect([...buffer.data.slice(0, 8)]).toEqual([7, 1, 2, 0, 9, 3, 4, 0]);
    expect(buffer.visibleTileCount).toBe(2);
    expect(initTexture).toHaveBeenCalledTimes(2);
  });
});

describe('WebGLVegetationAdapter', () => {
  it('updates visibility and disposes every owned texture', () => {
    const { renderer } = createRenderer();
    const adapter = new WebGLVegetationAdapter(
      renderer,
      createRuntimeDataset(),
    );
    const textures: DataTexture[] = [
      adapter.staticResources.storedChunkGridCoordinatesTexture,
      adapter.staticResources.chunkHeightRangesTexture,
      adapter.staticResources.heightDataTexture,
      ...adapter.staticResources.layerMasks.map((layer) => layer.texture),
      ...adapter.staticResources.patterns.map((pattern) => pattern.texture),
      ...adapter.staticResources.patterns.flatMap((pattern) => [
        pattern.bottomColors.texture,
        pattern.topColors.texture,
      ]),
      adapter.visibleChunkBuffer.texture,
    ];
    const disposeListeners = textures.map(() => vi.fn());
    textures.forEach((texture, index) => {
      texture.addEventListener('dispose', disposeListeners[index]!);
    });

    adapter.updateVisibleChunks(Uint32Array.from([1, 0]), 1);
    expect(adapter.visibleChunkBuffer.visibleChunkCount).toBe(1);
    expect(adapter.visibleChunkBuffer.data[0]).toBe(1);

    adapter.dispose();
    for (const listener of disposeListeners) expect(listener).toHaveBeenCalledOnce();
  });
});
