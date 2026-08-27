import { describe, expect, it } from 'vitest';

import {
  createChunkBoundingBoxes,
  FrustumChunkVisibility,
  type ParsedVegFile,
} from '../src/index.js';

const identityMatrix = new Float64Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

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
      version: 1,
      fileSize: 0,
      seed: 0,
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
        resolution: 2,
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

describe('createChunkBoundingBoxes', () => {
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

    const chunkBoundingBoxes = createChunkBoundingBoxes(file);

    expect(chunkBoundingBoxes.storedChunkCount).toBe(2);
    expect(chunkBoundingBoxes.minMaxCoordinates).toEqual(Float32Array.from([
      13.5, 1, 19.5, 18.5, 3.5, 24.5,
      9.5, 5, 23.5, 14.5, 6.5, 28.5,
    ]));
  });
});

describe('FrustumChunkVisibility', () => {
  it('returns chunks that intersect the frustum, including its boundary', () => {
    const chunkBoundingBoxes = createChunkBoundingBoxes(createParsedFile({
      gridWidth: 5,
      gridHeight: 1,
      chunkSize: 1,
      originX: -2.5,
      originY: 0,
      chunkLookup: [0, 1, 2, 3, 4],
      chunkHeightRanges: [0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5],
    }));
    const chunkVisibility = new FrustumChunkVisibility(chunkBoundingBoxes);

    const count = chunkVisibility.updateVisibleChunks(identityMatrix, 'negative-one-to-one');

    expect(count).toBe(3);
    expect(Array.from(chunkVisibility.visibleChunkIndices.subarray(0, count))).toEqual([1, 2, 3]);
  });

  it('applies the supplied model-to-clip transformation', () => {
    const chunkBoundingBoxes = createChunkBoundingBoxes(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 2,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [0, 0.5],
    }));
    const chunkVisibility = new FrustumChunkVisibility(chunkBoundingBoxes);
    const translatedClipFromModel = new Float64Array(identityMatrix);
    translatedClipFromModel[12] = -2.5;

    expect(chunkVisibility.updateVisibleChunks(identityMatrix, 'negative-one-to-one')).toBe(0);
    expect(
      chunkVisibility.updateVisibleChunks(translatedClipFromModel, 'negative-one-to-one'),
    ).toBe(1);
    expect(chunkVisibility.visibleChunkIndices[0]).toBe(0);
  });

  it('uses the requested WebGL or WebGPU clip-space depth range', () => {
    const chunkBoundingBoxes = createChunkBoundingBoxes(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [-0.75, -0.5],
    }));
    const chunkVisibility = new FrustumChunkVisibility(chunkBoundingBoxes);

    expect(chunkVisibility.updateVisibleChunks(identityMatrix, 'negative-one-to-one')).toBe(1);
    expect(chunkVisibility.updateVisibleChunks(identityMatrix, 'zero-to-one')).toBe(0);
  });

  it('reuses its visibility buffer across updates', () => {
    const chunkBoundingBoxes = createChunkBoundingBoxes(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [0, 0.5],
    }));
    const chunkVisibility = new FrustumChunkVisibility(chunkBoundingBoxes);
    const visibilityBuffer = chunkVisibility.visibleChunkIndices;

    chunkVisibility.updateVisibleChunks(identityMatrix, 'negative-one-to-one');
    chunkVisibility.updateVisibleChunks(identityMatrix, 'zero-to-one');

    expect(chunkVisibility.visibleChunkIndices).toBe(visibilityBuffer);
  });

  it('rejects malformed matrices', () => {
    const chunkBoundingBoxes = createChunkBoundingBoxes(createParsedFile({
      gridWidth: 1,
      gridHeight: 1,
      chunkSize: 1,
      originX: 0,
      originY: 0,
      chunkLookup: [0],
      chunkHeightRanges: [0, 0.5],
    }));
    const chunkVisibility = new FrustumChunkVisibility(chunkBoundingBoxes);

    expect(() => chunkVisibility.updateVisibleChunks(
      new Float32Array(15),
      'negative-one-to-one',
    )).toThrow('clipFromModelMatrix must contain exactly 16 values.');

    const matrixWithNaN = new Float64Array(identityMatrix);
    matrixWithNaN[6] = Number.NaN;
    expect(() => chunkVisibility.updateVisibleChunks(
      matrixWithNaN,
      'negative-one-to-one',
    )).toThrow('clipFromModelMatrix must contain only finite values.');
  });
});
