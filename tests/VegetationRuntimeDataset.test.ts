import { describe, expect, it } from 'vitest';

import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';
import {
  createVegetationRuntimeDataset,
  type ParsedVegFile,
  type VegetationRuntimeConfig,
} from '../src/index.js';

function createParsedFile(layerIds: readonly number[] = [0]): ParsedVegFile {
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
        maxX: 32,
        maxY: 8,
        maxZ: 32,
      },
      coordinateSystem: {
        upAxis: 'y',
        horizontalAxes: ['x', 'z'],
        unitsPerMeter: 2,
      },
      grid: {
        width: 1,
        height: 1,
        chunkSize: 32,
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
    chunkHeightRanges: Float32Array.from([0, 1]),
    heightData: Uint16Array.from([0, 0, 0, 0]),
    layers: layerIds.map((id) => ({
      id,
      maskResolution: 128,
      maskWordsPerChunk: 512,
      maskData: new Uint32Array(512),
    })),
  };
}

function createRuntimeConfig(layerIds: readonly number[] = [0]): VegetationRuntimeConfig {
  const sourceLayer = icakaVegetationRuntimeConfig.layers[0]!;
  return {
    ...icakaVegetationRuntimeConfig,
    layers: layerIds.map((layerId) => ({
      ...sourceLayer,
      layerId,
      key: `layer-${layerId}`,
    })),
  };
}

describe('createVegetationRuntimeDataset', () => {
  it('joins file and config layers without copying their source data', () => {
    const file = createParsedFile();
    const config = createRuntimeConfig();
    const dataset = createVegetationRuntimeDataset(file, config);

    expect(dataset.file).toBe(file);
    expect(dataset.config).toBe(config);
    expect(dataset.layers).toHaveLength(1);
    expect(dataset.enabledLayers).toEqual(dataset.layers);
    expect(dataset.layers[0]).toMatchObject({
      layerId: 0,
      key: 'layer-0',
      enabled: true,
      cellSizeUnits: 0.25,
      cellSizeMeters: 0.125,
    });
    expect(dataset.layers[0]!.fileLayer).toBe(file.layers[0]);
    expect(dataset.layers[0]!.config).toBe(config.layers[0]);
    expect(dataset.layers[0]!.patterns.lodAnchorCounts).toEqual(
      Uint32Array.from([4, 3, 2, 1, 1, 1, 1, 1]),
    );
  });

  it('rejects a VEGFILE layer without runtime configuration', () => {
    expect(() => createVegetationRuntimeDataset(
      createParsedFile([0, 1]),
      createRuntimeConfig([0]),
    )).toThrow('VEGFILE layer 1 has no runtime configuration.');
  });

  it('rejects a runtime layer without VEGFILE data', () => {
    expect(() => createVegetationRuntimeDataset(
      createParsedFile([0]),
      createRuntimeConfig([0, 1]),
    )).toThrow('Runtime layer 1 does not exist in the parsed VEGFILE.');
  });

  it('rejects grids whose global cell coordinates exceed the Cell-ID range', () => {
    const source = createParsedFile();
    const file: ParsedVegFile = {
      ...source,
      header: {
        ...source.header,
        grid: { ...source.header.grid, width: 0xffff_ffff },
      },
    };

    expect(() => createVegetationRuntimeDataset(file, createRuntimeConfig()))
      .toThrow('Runtime layer 0 exceeds the 32-bit global Cell-ID range.');
  });
});
