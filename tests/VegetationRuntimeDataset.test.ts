import { describe, expect, it, vi } from 'vitest';

import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import {
  createVegetationRuntimeDataset,
  grassLayerPreparation,
  requireGrassRuntimeLayer,
  type GrassRuntimeLayerConfig,
  type ParsedVegFile,
  type VegetationLayerPreparation,
  type VegetationRuntimeConfig,
} from '../src/index.js';

function createParsedFile(layerIds: readonly number[] = [0]): ParsedVegFile {
  return {
    bytes: new Uint8Array(),
    header: {
      version: 2,
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

function createRuntimeConfig(
  layerIds: readonly number[] = [0],
): VegetationRuntimeConfig<GrassRuntimeLayerConfig> {
  const sourceLayer = vegetationRuntimeConfig.layers[0]!;
  return {
    ...vegetationRuntimeConfig,
    layers: layerIds.map((layerId) => ({
      ...sourceLayer,
      layerId,
      key: `layer-${layerId}`,
    })),
  };
}

describe('createVegetationRuntimeDataset', () => {
  it('does not register Grass preparation implicitly', () => {
    expect(() => createVegetationRuntimeDataset(
      createParsedFile(),
      createRuntimeConfig(),
    )).toThrow('No vegetation layer preparation is registered for profile "grass".');
  });

  it('joins file and config layers without copying their source data', () => {
    const file = createParsedFile();
    const config = createRuntimeConfig();
    const dataset = createVegetationRuntimeDataset(file, config, [grassLayerPreparation]);

    expect(dataset.file).toBe(file);
    expect(dataset).not.toHaveProperty('config');
    expect(dataset.storedChunkGridCoordinates).toEqual(Uint32Array.of(0, 0));
    expect(dataset.preparedLayers).toHaveLength(1);
    expect(dataset.preparedLayers[0]).toMatchObject({
      layerId: 0,
      key: 'layer-0',
      cellSizeModelUnits: 0.25,
    });
    expect(dataset.preparedLayers[0]!.fileLayer).toBe(file.layers[0]);
    expect(dataset.preparedLayers[0]!.config).toBe(config.layers[0]);
    const grassLayer = requireGrassRuntimeLayer(dataset.preparedLayers[0]!);
    expect(grassLayer.preparedProfileData.patterns.anchorsPerPattern).toBe(4);
    expect(grassLayer.preparedProfileData.groundPatchField)
      .toBeUndefined();
  });

  it('creates the configured patch field once with the runtime layer', () => {
    const file = createParsedFile();
    const source = createRuntimeConfig();
    const config: VegetationRuntimeConfig<GrassRuntimeLayerConfig> = {
      ...source,
      layers: source.layers.map((layer) => ({
        ...layer,
        patches: {
          ground: {
            enabled: true,
            seed: 0,
            radiusMeters: { minimum: 2, maximum: 4 },
            targetCoverage: 0,
            allowMerging: true,
            edgeFalloffMeters: 1,
            shapeDistortion: 0.35,
            colors: { baseColor: '#39a83a', brightnessVariation: 0.08 },
          },
        },
      })),
    };

    const dataset = createVegetationRuntimeDataset(file, config, [grassLayerPreparation]);
    expect(requireGrassRuntimeLayer(
      dataset.preparedLayers[0]!,
    ).preparedProfileData.groundPatchField)
      .toMatchObject({
      layerId: 0,
      patchCount: 0,
      achievedCoverage: 0,
    });
  });

  it('ignores VEGFILE layers without runtime configuration', () => {
    const dataset = createVegetationRuntimeDataset(
      createParsedFile([0, 1]),
      createRuntimeConfig([0]),
      [grassLayerPreparation],
    );

    expect(dataset.preparedLayers.map((layer) => layer.layerId)).toEqual([0]);
  });

  it('does not prepare disabled configured layers', () => {
    const prepare = vi.fn(() => ({
      cullingBounds: {
        horizontalPaddingMeters: 1,
        belowSurfaceMeters: 0,
        aboveSurfaceMeters: 1,
      },
      preparedProfileData: undefined,
    }));
    const preparation: VegetationLayerPreparation = {
      profileType: 'test-disabled',
      prepare,
    };
    const disabledConfig = {
      configVersion: 3,
      layers: [{
        layerId: 0,
        key: 'disabled-layer',
        enabled: false,
        renderProfile: { type: 'test-disabled' },
      }],
    } satisfies VegetationRuntimeConfig;

    const dataset = createVegetationRuntimeDataset(
      createParsedFile(),
      disabledConfig,
      [preparation],
    );

    expect(dataset.preparedLayers).toEqual([]);
    expect(prepare).not.toHaveBeenCalled();
    expect(dataset.combinedCullingBounds).toEqual({
      horizontalPaddingMeters: 0,
      belowSurfaceMeters: 0,
      aboveSurfaceMeters: 0,
    });
  });

  it('rejects a runtime layer without VEGFILE data', () => {
    expect(() => createVegetationRuntimeDataset(
      createParsedFile([0]),
      createRuntimeConfig([0, 1]),
      [grassLayerPreparation],
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

    expect(() => createVegetationRuntimeDataset(
      file,
      createRuntimeConfig(),
      [grassLayerPreparation],
    ))
      .toThrow('Runtime layer 0 exceeds the 32-bit global Cell-ID range.');
  });

  it('combines profile bounds once for shared coarse culling', () => {
    const sourceLayer = vegetationRuntimeConfig.layers[0]!;
    const treeLayer = {
      layerId: 1,
      key: 'trees',
      enabled: sourceLayer.enabled,
      distribution: sourceLayer.distribution,
      visibility: sourceLayer.visibility,
      density: sourceLayer.density,
      pattern: sourceLayer.pattern,
      shadows: sourceLayer.shadows,
      lighting: { leafTranslucency: 0.5 },
      renderProfile: { type: 'test-tree', modelScale: 1 },
    };
    const config = {
      configVersion: 3,
      layers: [sourceLayer, treeLayer],
    } satisfies VegetationRuntimeConfig;
    const treePreparation: VegetationLayerPreparation = {
      profileType: 'test-tree',
      prepare: () => ({
        cullingBounds: {
          horizontalPaddingMeters: 3,
          belowSurfaceMeters: 0.5,
          aboveSurfaceMeters: 12,
        },
        preparedProfileData: undefined,
      }),
    };

    const dataset = createVegetationRuntimeDataset(
      createParsedFile([0, 1]),
      config,
      [grassLayerPreparation, treePreparation],
    );

    expect(dataset.combinedCullingBounds).toEqual({
      horizontalPaddingMeters: 3,
      belowSurfaceMeters: 0.5,
      aboveSurfaceMeters: 12,
    });
    expect(dataset.preparedLayers[1]!.preparedProfileData).toBeUndefined();
    expect('patches' in dataset.preparedLayers[1]!.config).toBe(false);
    expect('blade' in treeLayer).toBe(false);
  });
});
