import { describe, expect, it } from 'vitest';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import {
  createPreparedVegetationDataset, createVegetationActiveCellData,
  grassLayerPreparation,
  requireGrassRuntimeLayer,
  VegetationRenderTileDensity, type GrassRuntimeLayerConfig, type ParsedVegFile,
  type VegetationRuntimeConfig,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

function createDataset(seed = 42, ratio = 0.25, reordered = false) {
  const file: ParsedVegFile = {
    bytes: new Uint8Array(),
    header: {
      version: 2, vegetationSeed: seed, buildFingerprint: new Uint8Array(16), fileChecksum: 0,
      sourceBounds: { minX: 0, minY: 0, minZ: 0, maxX: 32, maxY: 0, maxZ: 16 },
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1 },
      grid: { width: 2, height: 1, chunkSize: 16, originX: 0, originY: 0 },
      storedChunkCount: 2, heightMap: { resolutionPerChunkAxis: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.from(reordered ? [1, 0] : [0, 1]),
    chunkHeightRanges: new Float32Array(4), heightData: new Uint16Array(8),
    layers: [{ vegetationLayerId: 0, maskResolutionPerChunkAxis: 64, maskWordsPerChunk: 128,
      maskData: new Uint32Array(256).fill(0xffff_ffff) }],
  };
  const layer = vegetationRuntimeConfig.layers[0]!;
  const maximumDistanceMeters = layer.visibility.maximumDistanceMeters;
  const config = {
    ...vegetationRuntimeConfig,
    layers: [{ ...layer, density: { ...layer.density, renderTileSizeCells: 32,
      activeCells: [
        { distanceMeters: 0, ratio },
        { distanceMeters: maximumDistanceMeters * 0.8, ratio },
        { distanceMeters: maximumDistanceMeters, ratio: 0 },
      ],
      activeAnchors: [{ distanceMeters: 0, ratio: 1 }],
      activeElements: [{ distanceMeters: 0, ratio: 1 }],
    } }],
  } satisfies VegetationRuntimeConfig<GrassRuntimeLayerConfig>;
  return createPreparedVegetationDataset(file, config, [grassLayerPreparation]);
}

describe('seeded Cell coverage', () => {
  it('is repeatable, changes with the seed and never duplicates or loses eligible Cells', () => {
    const dataset = createDataset();
    const data = createVegetationActiveCellData(dataset, 0);
    const cellsPerChunk = dataset.file.layers[0]!.maskResolutionPerChunkAxis ** 2;
    const storedChunkCount = dataset.file.header.storedChunkCount;
    expect(createVegetationActiveCellData(dataset, 0)).toEqual(data);
    expect(createVegetationActiveCellData(createDataset(43), 0).indices).not.toEqual(data.indices);
    expect(data.indices).toHaveLength(storedChunkCount * cellsPerChunk);
    for (let chunk = 0; chunk < storedChunkCount; chunk += 1) {
      expect(new Set(
        data.indices.slice(chunk * cellsPerChunk, (chunk + 1) * cellsPerChunk),
      ).size).toBe(cellsPerChunk);
    }
    expect(dataset.file.layers[0]!.maskData.every((word) => word === 0xffff_ffff)).toBe(true);
  });

  it('keeps the same spatial selection after stored chunks are reordered', () => {
    const dataset = createDataset();
    const cellsPerChunk = dataset.file.layers[0]!.maskResolutionPerChunkAxis ** 2;
    const original = createVegetationActiveCellData(dataset, 0).indices;
    const reordered = createVegetationActiveCellData(createDataset(42, 0.25, true), 0).indices;
    expect(reordered.slice(0, cellsPerChunk)).toEqual(original.slice(cellsPerChunk));
    expect(reordered.slice(cellsPerChunk)).toEqual(original.slice(0, cellsPerChunk));
  });

  it.each([0, 0.1, 0.25, 0.5, 1])('admits the rounded %s fraction per tile without reshuffling', (ratio) => {
    const dataset = createDataset(42, ratio);
    const density = new VegetationRenderTileDensity(dataset, 0);
    const layer = requireGrassRuntimeLayer(dataset.preparedLayers[0]!);
    const cellsPerTile = layer.config.density.renderTileSizeCells ** 2;
    const tilesPerChunkAxis = layer.fileLayer.maskResolutionPerChunkAxis
      / layer.config.density.renderTileSizeCells;
    const maximumVisibleTileCount = dataset.file.header.storedChunkCount
      * tilesPerChunkAxis ** 2;
    const originalIndices = density.activeCellIndices.slice();
    const visibleStoredChunks = Uint32Array.from(
      { length: dataset.file.header.storedChunkCount },
      (_, storedChunkIndex) => storedChunkIndex,
    );
    density.update(
      visibleStoredChunks,
      visibleStoredChunks.length,
      { x: 0, y: 0, z: 0 },
    );
    const count = Math.round(cellsPerTile * ratio);
    expect(density.visibleTileCount).toBe(count ? maximumVisibleTileCount : 0);
    for (let tile = 0; tile < density.visibleTileCount; tile++) {
      expect(density.renderTileRecords[tile * 4 + 2]! & 0xffff).toBe(count);
    }
    expect(density.visibleCandidateCount).toBe(
      count
      * maximumVisibleTileCount
      * layer.config.distribution.anchorsPerCell
      * layer.config.distribution.elementsPerAnchor,
    );
    density.update(
      visibleStoredChunks,
      visibleStoredChunks.length,
      { x: 0, y: layer.config.visibility.maximumDistanceMeters + 1, z: 0 },
    );
    expect(density.visibleCandidateCount).toBe(0);
    expect(density.activeCellIndices).toEqual(originalIndices);
    const otherDensity = new VegetationRenderTileDensity(createDataset(42, 0.75), 0);
    expect(otherDensity.activeCellIndices).toEqual(originalIndices);
    // Lower coverage is a prefix of the same permutation, not a new random set.
    expect([...originalIndices.slice(0, count)].every((cell) =>
      new Set(otherDensity.activeCellIndices.slice(0, cellsPerTile)).has(cell))).toBe(true);
  });
});
