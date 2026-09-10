import { describe, expect, it } from 'vitest';

import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import {
  createVegetationRuntimeDataset,
  createVegetationActiveCellData,
  MAXIMUM_WEBGL_INSTANCE_COUNT,
  validateWebGLInstanceCount,
  VegetationRenderTileDensity,
  type ParsedVegFile,
  type VegetationRuntimeConfig,
  type VegetationRuntimeDataset,
} from '../src/index.js';

function createDataset(configure?: (config: VegetationRuntimeConfig) => VegetationRuntimeConfig) {
  const file: ParsedVegFile = {
    bytes: new Uint8Array(),
    header: {
      version: 1,
      fileSize: 0,
      seed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: { minX: 0, minY: 0, minZ: 0, maxX: 128, maxY: 0, maxZ: 128 },
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1 },
      grid: { width: 1, height: 1, chunkSize: 128, originX: 0, originY: 0 },
      storedChunkCount: 1,
      heightMap: { resolution: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.from([0]),
    chunkHeightRanges: Float32Array.from([0, 0]),
    heightData: new Uint16Array(4),
    layers: [{
      id: 0,
      maskResolution: 8,
      maskWordsPerChunk: 2,
      maskData: Uint32Array.from([0b11_0000_0011, 0x8000_0000]),
    }],
  };
  const sourceLayer = vegetationRuntimeConfig.layers[0]!;
  const config: VegetationRuntimeConfig = {
    ...vegetationRuntimeConfig,
    layers: [{
      ...sourceLayer,
      density: { ...sourceLayer.density, renderTileSizeCells: 2 },
    }],
  };
  return createVegetationRuntimeDataset(file, configure ? configure(config) : config);
}

function constantCurve(ratio: number) {
  return [
    { distanceMeters: 0, ratio },
    { distanceMeters: 499, ratio },
    { distanceMeters: 500, ratio: 0 },
  ] as const;
}

describe('VegetationRenderTileDensity', () => {
  it('accepts transferred initialization data without rebuilding Cell admission', () => {
    const dataset = createDataset();
    const prepared = structuredClone(createVegetationActiveCellData(dataset, 0));
    const density = new VegetationRenderTileDensity(dataset, 0, prepared);
    expect(density.activeCellIndices).toBe(prepared.indices);
    const original = new VegetationRenderTileDensity(dataset, 0);
    density.update(Uint32Array.of(0), 1, { x: 1, y: 100, z: 1 });
    original.update(Uint32Array.of(0), 1, { x: 1, y: 100, z: 1 });
    expect(density.tileRecords).toEqual(original.tileRecords);
    expect(() => new VegetationRenderTileDensity(dataset, 0, {
      ...prepared, renderTileSizeCells: 99,
    })).toThrow('Prepared active Cells do not match');
  });

  it('precomputes only mask-active Cells in stable prefix order', () => {
    const density = new VegetationRenderTileDensity(createDataset(), 0);
    expect(density.renderTileSizeCells).toBe(2);
    expect(density.tilesPerChunkAxis).toBe(4);
    expect(density.activeCellIndices).toHaveLength(5);
    expect(new Set(density.activeCellIndices).size).toBe(5);
    expect([...density.activeCellIndices].sort((a, b) => a - b))
      .toEqual([0, 1, 8, 9, 63]);
  });

  it('excludes mask-inactive Cells before building tile prefixes', () => {
    const dataset = withMask(createDataset(), () => false);
    expect(new VegetationRenderTileDensity(dataset, 0).activeCellIndices).toHaveLength(0);
  });

  it('does not use ground coverage for Cell admission', () => {
    const dataset = createDataset((config) => ({
      ...config,
      layers: config.layers.map((layer) => ({
        ...layer,
        patches: {
          ground: {
            enabled: true, seed: 0, radiusMeters: { minimum: 8, maximum: 32 },
            targetCoverage: 0, allowMerging: true, edgeFalloffMeters: 3,
            shapeDistortion: 0.35, colors: { baseColor: '#39a83a', brightnessVariation: 0.08 },
          },
        },
      })),
    }));
    expect(new VegetationRenderTileDensity(dataset, 0).activeCellIndices).toHaveLength(5);
  });

  it('preserves every distance budget when eligibility is unchanged', () => {
    const dataset = createDataset();
    const original = new VegetationRenderTileDensity(dataset, 0);
    const patched = new VegetationRenderTileDensity(withMask(dataset, () => true), 0);
    expect(patched.activeCellIndices).toEqual(original.activeCellIndices);
    for (const distance of [0, 50, 127, 220, 500, 0]) {
      const camera = { x: 1, y: distance, z: 1 };
      original.update(Uint32Array.of(0), 1, camera);
      patched.update(Uint32Array.of(0), 1, camera);
      expect(patched.tileRecords).toEqual(original.tileRecords);
      expect(patched.bucketTileCounts).toEqual(original.bucketTileCounts);
      expect(patched.visibleCandidateCount).toBe(original.visibleCandidateCount);
    }
  });

  it('applies independent Cell, Anchor and Element budgets to eligible Cells', () => {
    const curve = [
      { distanceMeters: 0, ratio: 1 },
      { distanceMeters: 100, ratio: 0.5 },
      { distanceMeters: 200, ratio: 0 },
    ];
    const dataset = withMask(createDataset((config) => ({
      ...config,
      layers: config.layers.map((layer) => ({
        ...layer,
        distribution: { ...layer.distribution, elementsPerAnchor: 2 },
        density: { ...layer.density, activeCells: curve, activeAnchors: curve, activeElements: curve },
      })),
    })), (index) => index < 2);
    const density = new VegetationRenderTileDensity(dataset, 0);
    const cells = density.activeCellIndices;
    const fieldBefore = dataset.layers[0]!.fileLayer.maskData.slice();
    for (const [distance, expected] of [
      [0, { cells: 2, anchors: 8, elements: 16 }],
      [100, { cells: 1, anchors: 2, elements: 2 }],
      [0, { cells: 2, anchors: 8, elements: 16 }],
    ] as const) {
      density.update(Uint32Array.of(0), 1, { x: 1, y: distance, z: 1 });
      expect(density.visibleTileCount).toBe(1);
      expect(unpackRecord(density.tileRecords)).toMatchObject(expected);
      expect(density.activeCellIndices).toBe(cells);
    }
    density.update(Uint32Array.of(0), 1, { x: 1, y: 200, z: 1 });
    expect(density.visibleCandidateCount).toBe(0);
    expect(dataset.layers[0]!.fileLayer.maskData).toEqual(fieldBefore);
  });

  it('computes tile-wide budgets and uses the smallest power-of-two bucket', () => {
    const density = new VegetationRenderTileDensity(createDataset((config) => ({
      ...config,
      layers: config.layers.map((layer) => ({
        ...layer,
        density: {
          ...layer.density,
          activeCells: constantCurve(1),
          activeAnchors: constantCurve(0.345),
          activeElements: constantCurve(1),
        },
      })),
    })), 0);

    density.update(Uint32Array.of(0), 1, { x: 1, y: 0, z: 1 });

    expect(density.visibleTileCount).toBe(2);
    expect(density.visibleCandidateCount).toBe(7);
    expect([...density.bucketTileCounts]).toEqual([1, 0, 0, 1, 0]);
    expect([...density.bucketRecordOffsets]).toEqual([0, 1, 1, 1, 2]);
    const distantRecord = density.tileRecords.slice(0, 4);
    const nearRecord = density.tileRecords.slice(4, 8);
    expect(unpackRecord(distantRecord)).toMatchObject({ cells: 1, anchors: 1, elements: 1 });
    expect(unpackRecord(nearRecord)).toMatchObject({ cells: 4, anchors: 6, elements: 6 });
  });

  it('culls subchunk Tiles that are outside the frustum of an otherwise visible Chunk', () => {
    const density = new VegetationRenderTileDensity(createDataset(), 0);
    const firstTileOnly = new Float64Array([
      2 / 31, 0, 0, 0,
      0, 0, 0, 0,
      0, 2 / 31, 0, 0,
      -1 - 1 / 31, -1 - 1 / 31, 0, 1,
    ]);

    density.update(
      Uint32Array.of(0),
      1,
      { x: 1, y: 0, z: 1 },
      firstTileOnly,
      'negative-one-to-one',
    );

    expect(density.frustumTestedTileCount).toBe(2);
    expect(density.frustumCulledTileCount).toBe(1);
    expect(density.visibleTileCount).toBe(1);
    expect(unpackRecord(density.tileRecords)).toMatchObject({ cells: 4 });
  });

  it('uses profile bounds for shared Tile-frustum culling', () => {
    const clipFromTallVegetation = new Float64Array([
      2 / 31, 0, 0, 0,
      0, 0, 1, 0,
      0, 2 / 31, 0, 0,
      -1 - 1 / 31, -1 - 1 / 31, -8, 1,
    ]);
    const low = new VegetationRenderTileDensity(createDataset(), 0);
    const tall = new VegetationRenderTileDensity(createDataset((config) => ({
      ...config,
      layers: config.layers.map((layer) => ({
        ...layer,
        renderBounds: { ...layer.renderBounds, aboveSurfaceMeters: 8 },
        renderProfile: { type: 'test-tree' },
      })),
    })), 0);

    low.update(Uint32Array.of(0), 1, { x: 1, y: 0, z: 1 }, clipFromTallVegetation);
    tall.update(Uint32Array.of(0), 1, { x: 1, y: 0, z: 1 }, clipFromTallVegetation);

    expect(low.visibleTileCount).toBe(0);
    expect(tall.visibleTileCount).toBe(1);
  });

  it('reuses its work arrays and omits zero-density or out-of-range Tiles', () => {
    const density = new VegetationRenderTileDensity(createDataset(), 0);
    const records = density.tileRecords;
    const cells = density.activeCellIndices;
    density.update(Uint32Array.of(0), 1, { x: 1_000, y: 0, z: 1_000 });
    expect(density.visibleTileCount).toBe(0);
    expect(density.visibleCandidateCount).toBe(0);
    expect(density.tileRecords).toBe(records);
    expect(density.activeCellIndices).toBe(cells);

    const zeroDensity = new VegetationRenderTileDensity(createDataset((config) => ({
      ...config,
      layers: config.layers.map((layer) => ({
        ...layer,
        density: { ...layer.density, activeCells: constantCurve(0) },
      })),
    })), 0);
    zeroDensity.update(Uint32Array.of(0), 1, { x: 0, y: 0, z: 0 });
    expect(zeroDensity.visibleTileCount).toBe(0);
  });

  it('rejects visible chunk indices outside the parsed asset', () => {
    const density = new VegetationRenderTileDensity(createDataset(), 0);
    expect(() => density.update(Uint32Array.of(1), 1, { x: 0, y: 0, z: 0 }))
      .toThrow('Visible stored chunk index 1 is out of range.');
  });

  it('rejects instance budgets outside WebGL signed GLsizei', () => {
    expect(MAXIMUM_WEBGL_INSTANCE_COUNT).toBe(0x7fff_ffff);
    expect(() => validateWebGLInstanceCount(MAXIMUM_WEBGL_INSTANCE_COUNT + 1, 'Test count'))
      .toThrow('signed WebGL GLsizei range');
    expect(() => validateWebGLInstanceCount(MAXIMUM_WEBGL_INSTANCE_COUNT, 'Test count'))
      .not.toThrow();
  });


});

function unpackRecord(record: Uint32Array) {
  return {
    storedChunkIndex: record[0],
    activeCellOffset: record[1],
    cells: record[2]! & 0xffff,
    anchors: record[2]! >>> 16,
    elements: record[3],
  };
}

function withMask(
  dataset: VegetationRuntimeDataset,
  admitted: (index: number) => boolean,
): VegetationRuntimeDataset {
  const maskData = dataset.layers[0]!.fileLayer.maskData.slice();
  for (let index = 0; index < 64; index += 1) {
    if (!admitted(index)) maskData[Math.floor(index / 32)]! &= ~(1 << (index % 32));
  }
  const layer = { ...dataset.layers[0]!, fileLayer: {
    ...dataset.layers[0]!.fileLayer, maskData,
  } };
  return { ...dataset, layers: [layer], enabledLayers: [layer] };
}
