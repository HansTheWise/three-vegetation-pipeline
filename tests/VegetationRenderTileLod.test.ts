import { describe, expect, it } from 'vitest';

import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';
import {
  createVegetationRuntimeDataset,
  selectLodTileCell,
  VegetationRenderTileLod,
  type ParsedVegFile,
  type VegetationRuntimeConfig,
} from '../src/index.js';

function createDataset() {
  const file: ParsedVegFile = {
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
        maxX: 128,
        maxY: 0,
        maxZ: 128,
      },
      coordinateSystem: {
        upAxis: 'y',
        horizontalAxes: ['x', 'z'],
        unitsPerMeter: 1,
      },
      grid: {
        width: 1,
        height: 1,
        chunkSize: 128,
        originX: 0,
        originY: 0,
      },
      storedChunkCount: 1,
      heightMap: {
        resolution: 2,
        valueBits: 16,
        valuesPerChunk: 4,
      },
    },
    chunkLookup: Int32Array.from([0]),
    chunkHeightRanges: Float32Array.from([0, 0]),
    heightData: new Uint16Array(4),
    layers: [{
      id: 0,
      maskResolution: 8,
      maskWordsPerChunk: 2,
      maskData: Uint32Array.from([1, 0x8000_0000]),
    }],
  };
  const sourceLayer = icakaVegetationRuntimeConfig.layers[0]!;
  const config: VegetationRuntimeConfig = {
    ...icakaVegetationRuntimeConfig,
    layers: [{
      ...sourceLayer,
      lod: { ...sourceLayer.lod, renderTileSizeCells: 2 },
    }],
  };
  return createVegetationRuntimeDataset(file, config);
}

describe('VegetationRenderTileLod', () => {
  it('keeps only active tiles and assigns real candidate prefixes by distance', () => {
    const lod = new VegetationRenderTileLod(createDataset(), 0);

    lod.update(Uint32Array.from([0]), 1, { x: 1, y: 0, z: 1 });

    expect(lod.renderTileSizeCells).toBe(2);
    expect(lod.tilesPerChunkAxis).toBe(4);
    expect(lod.levels.map(({ cellCount, anchorCount, elementCount }) => ({
      cellCount,
      anchorCount,
      elementCount,
    }))).toEqual([
      { cellCount: 4, anchorCount: 4, elementCount: 1 },
      { cellCount: 4, anchorCount: 3, elementCount: 1 },
      { cellCount: 4, anchorCount: 2, elementCount: 1 },
      { cellCount: 4, anchorCount: 1, elementCount: 1 },
      { cellCount: 2, anchorCount: 1, elementCount: 1 },
      { cellCount: 1, anchorCount: 1, elementCount: 1 },
    ]);
    expect([...lod.tileCounts].reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(lod.tileCounts[0]).toBe(1);
    expect([...lod.levels[0]!.tileRecords.slice(0, 3)]).toEqual([0, 0, 0]);
    const distantLevel = [...lod.tileCounts].findIndex((count, index) => index > 0 && count === 1);
    expect([...lod.levels[distantLevel]!.tileRecords.slice(0, 3)]).toEqual([0, 3, 3]);
  });

  it('reuses its work arrays and removes tiles beyond the configured range', () => {
    const lod = new VegetationRenderTileLod(createDataset(), 0);
    const records = lod.levels.map((level) => level.tileRecords);

    lod.update(Uint32Array.from([0]), 1, { x: 1_000, y: 0, z: 1_000 });

    expect([...lod.tileCounts]).toEqual(new Array(lod.levels.length).fill(0));
    expect(lod.levels.map((level) => level.tileRecords)).toEqual(records);
    expect(lod.fadeStartsMeters[0]).toBeGreaterThan(
      icakaVegetationRuntimeConfig.layers[0]!.bladeCount.startsDecreasingAtMeters,
    );
    expect(lod.fadeEndsMeters[0]).toBeGreaterThan(lod.fadeStartsMeters[0]!);
    expect(lod.fadeEndsMeters.at(-1)).toBe(500);
  });

  it('rejects visible chunk indices outside the parsed asset', () => {
    const lod = new VegetationRenderTileLod(createDataset(), 0);

    expect(() => lod.update(
      Uint32Array.from([1]),
      1,
      { x: 0, y: 0, z: 0 },
    )).toThrow('Visible stored chunk index 1 is out of range.');
  });

  it('maps every compact prefix index to one stable non-repeating Tile Cell', () => {
    const first = Array.from({ length: 32 ** 2 }, (_, selectedCellIndex) => (
      selectLodTileCell(42, 0, 128, 96, 32, selectedCellIndex)
    ));
    const second = Array.from({ length: 32 ** 2 }, (_, selectedCellIndex) => (
      selectLodTileCell(42, 0, 128, 96, 32, selectedCellIndex)
    ));
    const keys = first.map(({ x, y }) => `${x},${y}`);

    expect(second).toEqual(first);
    expect(new Set(keys).size).toBe(32 ** 2);
    expect(new Set(keys.slice(0, 16)).size).toBe(16);
    expect(keys.slice(0, 16).every((cell) => keys.slice(0, 128).includes(cell))).toBe(true);
  });
});
