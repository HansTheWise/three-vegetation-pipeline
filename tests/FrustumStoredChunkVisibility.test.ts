import { describe, expect, it } from 'vitest';

import {
  createStoredChunkCullingBounds,
  createStoredChunkGridCoordinateLookup,
  FrustumStoredChunkVisibility,
  type ParsedVegFile,
  type VegetationLayerCullingBounds,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

const identityMatrix = new Float64Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

const cullingBounds = {
  horizontalPaddingMeters: 0.25,
  belowSurfaceMeters: 0,
  aboveSurfaceMeters: 0.25,
} as const;

type ParsedFileOptions = Readonly<{
  upAxis?: 'x' | 'y' | 'z';
  horizontalAxes?: readonly ['x' | 'y' | 'z', 'x' | 'y' | 'z'];
  unitsPerMeter?: number;
  gridWidth: number;
  gridHeight: number;
  chunkSize: number;
  originX: number;
  originY: number;
  chunkLookup: readonly number[];
  chunkHeightRanges: readonly number[];
}>;

function createParsedFile(options: ParsedFileOptions): ParsedVegFile {
  const storedChunkCount = options.chunkHeightRanges.length / 2;

  return {
    bytes: new Uint8Array(),
    header: {
      version: 2,
      vegetationSeed: 0,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
      },
      coordinateSystem: {
        upAxis: options.upAxis ?? 'z',
        horizontalAxes: options.horizontalAxes ?? ['x', 'y'],
        unitsPerMeter: options.unitsPerMeter ?? 1,
      },
      grid: {
        width: options.gridWidth,
        height: options.gridHeight,
        chunkSize: options.chunkSize,
        originX: options.originX,
        originY: options.originY,
      },
      storedChunkCount,
      heightMap: {
        resolutionPerChunkAxis: 2,
        valueBits: 16,
        valuesPerChunk: 4,
      },
    },
    chunkLookup: Int32Array.from(options.chunkLookup),
    chunkHeightRanges: Float32Array.from(options.chunkHeightRanges),
    heightData: new Uint16Array(storedChunkCount * 4),
    layers: [],
  };
}

function createCullingBounds(
  file: ParsedVegFile,
  bounds: VegetationLayerCullingBounds = cullingBounds,
) {
  return createStoredChunkCullingBounds(
    file,
    createStoredChunkGridCoordinateLookup(file),
    bounds,
  );
}

describe('createStoredChunkCullingBounds', () => {
  it('builds stored-chunk bounds from the grid axes, height ranges, and padding', () => {
    const file = createParsedFile({
      upAxis: 'y',
      horizontalAxes: ['x', 'z'],
      unitsPerMeter: 2,
      gridWidth: 2,
      gridHeight: 2,
      chunkSize: 4,
      originX: 10,
      originY: 20,
      chunkLookup: [-1, 0, 1, -1],
      chunkHeightRanges: [1, 3, 5, 6],
    });

    const storedChunkCullingBounds = createCullingBounds(file);

    expect(storedChunkCullingBounds.storedChunkCount).toBe(2);
    expect(storedChunkCullingBounds.minimumMaximumCoordinates).toEqual(Float32Array.from([
      13.5, 1, 19.5, 18.5, 3.5, 24.5,
      9.5, 5, 23.5, 14.5, 6.5, 28.5,
    ]));
  });
});

describe('FrustumStoredChunkVisibility', () => {
  it('uses the same culler for low grass and a taller profile', () => {
    const file = createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [-3, -3],
    });
    const low = new FrustumStoredChunkVisibility(createCullingBounds(file, {
      horizontalPaddingMeters: 0.25,
      belowSurfaceMeters: 0,
      aboveSurfaceMeters: 0.5,
    }));
    const tall = new FrustumStoredChunkVisibility(createCullingBounds(file, {
      horizontalPaddingMeters: 2,
      belowSurfaceMeters: 0,
      aboveSurfaceMeters: 4,
    }));

    expect(low.updateVisibleStoredChunks(identityMatrix, 'negative-one-to-one')).toBe(0);
    expect(tall.updateVisibleStoredChunks(identityMatrix, 'negative-one-to-one')).toBe(1);
  });

  it('returns chunks that intersect the frustum, including its boundary', () => {
    const storedChunkCullingBounds = createCullingBounds(createParsedFile({
      gridWidth: 5,
      gridHeight: 1,
      chunkSize: 1,
      originX: -2.5,
      originY: 0,
      chunkLookup: [0, 1, 2, 3, 4],
      chunkHeightRanges: [0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5],
    }), cullingBounds);
    const chunkVisibility = new FrustumStoredChunkVisibility(storedChunkCullingBounds);

    const count = chunkVisibility.updateVisibleStoredChunks(identityMatrix, 'negative-one-to-one');

    expect(count).toBe(3);
    expect(Array.from(chunkVisibility.visibleStoredChunkIndices.subarray(0, count))).toEqual([1, 2, 3]);
  });

  it('applies the supplied model-to-clip transformation', () => {
    const storedChunkCullingBounds = createCullingBounds(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 2,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [0, 0.5],
    }), cullingBounds);
    const chunkVisibility = new FrustumStoredChunkVisibility(storedChunkCullingBounds);
    const translatedClipFromModel = new Float64Array(identityMatrix);
    translatedClipFromModel[12] = -2.5;

    expect(chunkVisibility.updateVisibleStoredChunks(identityMatrix, 'negative-one-to-one')).toBe(0);
    expect(
      chunkVisibility.updateVisibleStoredChunks(translatedClipFromModel, 'negative-one-to-one'),
    ).toBe(1);
    expect(chunkVisibility.visibleStoredChunkIndices[0]).toBe(0);
  });

  it('uses the requested WebGL or WebGPU clip-space depth range', () => {
    const storedChunkCullingBounds = createCullingBounds(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [-0.75, -0.5],
    }), cullingBounds);
    const chunkVisibility = new FrustumStoredChunkVisibility(storedChunkCullingBounds);

    expect(chunkVisibility.updateVisibleStoredChunks(identityMatrix, 'negative-one-to-one')).toBe(1);
    expect(chunkVisibility.updateVisibleStoredChunks(identityMatrix, 'zero-to-one')).toBe(0);
  });

  it('reuses its visibility buffer across updates', () => {
    const storedChunkCullingBounds = createCullingBounds(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [0, 0.5],
    }), cullingBounds);
    const chunkVisibility = new FrustumStoredChunkVisibility(storedChunkCullingBounds);
    const visibilityBuffer = chunkVisibility.visibleStoredChunkIndices;

    chunkVisibility.updateVisibleStoredChunks(identityMatrix, 'negative-one-to-one');
    chunkVisibility.updateVisibleStoredChunks(identityMatrix, 'zero-to-one');

    expect(chunkVisibility.visibleStoredChunkIndices).toBe(visibilityBuffer);
  });

  it('rejects malformed matrices', () => {
    const storedChunkCullingBounds = createCullingBounds(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [0, 0.5],
    }), cullingBounds);
    const chunkVisibility = new FrustumStoredChunkVisibility(storedChunkCullingBounds);

    expect(() => chunkVisibility.updateVisibleStoredChunks(
      new Float32Array(15),
      'negative-one-to-one',
    )).toThrow('clipFromModelMatrix must contain exactly 16 values.');

    const matrixWithNaN = new Float64Array(identityMatrix);
    matrixWithNaN[6] = Number.NaN;
    expect(() => chunkVisibility.updateVisibleStoredChunks(
      matrixWithNaN,
      'negative-one-to-one',
    )).toThrow('clipFromModelMatrix must contain only finite values.');
  });
});
