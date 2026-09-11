import { describe, expect, it } from 'vitest';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import {
  createVegetationRuntimeDataset, createVegetationActiveCellData,
  VegetationRenderTileDensity, type GrassRuntimeLayerConfig, type ParsedVegFile,
  type VegetationRuntimeConfig,
} from '../src/index.js';

function createDataset(seed = 42, ratio = 0.25, reordered = false) {
  const file: ParsedVegFile = {
    bytes: new Uint8Array(),
    header: {
      version: 1, fileSize: 0, seed, buildFingerprint: new Uint8Array(16), fileChecksum: 0,
      sourceBounds: { minX: 0, minY: 0, minZ: 0, maxX: 32, maxY: 0, maxZ: 16 },
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1 },
      grid: { width: 2, height: 1, chunkSize: 16, originX: 0, originY: 0 },
      storedChunkCount: 2, heightMap: { resolution: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.from(reordered ? [1, 0] : [0, 1]),
    chunkHeightRanges: new Float32Array(4), heightData: new Uint16Array(8),
    layers: [{ id: 0, maskResolution: 64, maskWordsPerChunk: 128,
      maskData: new Uint32Array(256).fill(0xffff_ffff) }],
  };
  const layer = vegetationRuntimeConfig.layers[0]!;
  const config = {
    ...vegetationRuntimeConfig,
    layers: [{ ...layer, density: { ...layer.density, renderTileSizeCells: 32,
      activeCells: [{ distanceMeters: 0, ratio }, { distanceMeters: 400, ratio }, { distanceMeters: 500, ratio: 0 }],
      activeAnchors: [{ distanceMeters: 0, ratio: 1 }],
      activeElements: [{ distanceMeters: 0, ratio: 1 }],
    } }],
  } satisfies VegetationRuntimeConfig<GrassRuntimeLayerConfig>;
  return createVegetationRuntimeDataset(file, config);
}

describe('seeded Cell coverage', () => {
  it('is repeatable, changes with the seed and never duplicates or loses eligible Cells', () => {
    const dataset = createDataset();
    const data = createVegetationActiveCellData(dataset, 0);
    expect(createVegetationActiveCellData(dataset, 0)).toEqual(data);
    expect(createVegetationActiveCellData(createDataset(43), 0).indices).not.toEqual(data.indices);
    expect(data.indices).toHaveLength(8192);
    for (let chunk = 0; chunk < 2; chunk++) {
      expect(new Set(data.indices.slice(chunk * 4096, (chunk + 1) * 4096)).size).toBe(4096);
    }
    expect(dataset.file.layers[0]!.maskData.every((word) => word === 0xffff_ffff)).toBe(true);
  });

  it('keeps the same spatial selection after stored chunks are reordered', () => {
    const original = createVegetationActiveCellData(createDataset(), 0).indices;
    const reordered = createVegetationActiveCellData(createDataset(42, 0.25, true), 0).indices;
    expect(reordered.slice(0, 4096)).toEqual(original.slice(4096));
    expect(reordered.slice(4096)).toEqual(original.slice(0, 4096));
  });

  it.each([0, 0.1, 0.25, 0.5, 1])('admits the rounded %s fraction per tile without reshuffling', (ratio) => {
    const density = new VegetationRenderTileDensity(createDataset(42, ratio), 0);
    const originalIndices = density.activeCellIndices.slice();
    density.update(Uint32Array.of(0, 1), 2, { x: 0, y: 0, z: 0 });
    const count = Math.round(1024 * ratio);
    expect(density.visibleTileCount).toBe(count ? 8 : 0);
    for (let tile = 0; tile < density.visibleTileCount; tile++) {
      expect(density.tileRecords[tile * 4 + 2]! & 0xffff).toBe(count);
    }
    expect(density.visibleCandidateCount).toBe(count * 8 * 4);
    density.update(Uint32Array.of(0, 1), 2, { x: 0, y: 600, z: 0 });
    expect(density.visibleCandidateCount).toBe(0);
    expect(density.activeCellIndices).toEqual(originalIndices);
    const otherDensity = new VegetationRenderTileDensity(createDataset(42, 0.75), 0);
    expect(otherDensity.activeCellIndices).toEqual(originalIndices);
    // Lower coverage is a prefix of the same permutation, not a new random set.
    expect([...originalIndices.slice(0, count)].every((cell) =>
      new Set(otherDensity.activeCellIndices.slice(0, 1024)).has(cell))).toBe(true);
  });

  it('does not impose one Cell per column or repeat the same tile template', () => {
    const { indices } = createVegetationActiveCellData(createDataset(), 0);
    const first = indices.slice(0, 32);
    const columns = new Set([...first].map((cell) => cell % 32));
    expect(columns.size).toBeGreaterThan(12);
    expect(columns.size).toBeLessThan(29);
    const tilePattern = (offset: number) => [...indices.slice(offset, offset + 256)]
      .map((cell) => (Math.floor(cell / 64) % 32) * 32 + cell % 32);
    expect(tilePattern(0)).not.toEqual(tilePattern(1024));
    expect(tilePattern(0)).not.toEqual(tilePattern(4096));
  });
});
