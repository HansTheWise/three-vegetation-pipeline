import { describe, expect, it } from 'vitest';
import type { VegetationExtractionConfig } from '../src/config/types.js';
import { extractVegetation } from '../src/extractor/VegetationExtractor.js';
import type { ModelData, ModelPrimitive } from '../src/reader/types.js';

describe('extractVegetation', () => {
  it('extracts a flat Z-up surface into one chunk', () => {
    const dataset = extractVegetation(
      modelWithPrimitives([squarePrimitive('surface', 'grass', 0, 0, 4, 4, 2)]),
      createConfig(),
    );

    expect(dataset.seed).toBe(42);
    expect(dataset.grid).toEqual({
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
      chunkSize: 4,
    });
    expect([...dataset.chunkLookup]).toEqual([0]);
    expect(dataset.chunks).toEqual([{
      gridX: 0,
      gridY: 0,
      minimumHeight: 2,
      maximumHeight: 2,
    }]);
    expect([...dataset.heightData]).toEqual(new Array(9).fill(2));
    expect([...dataset.layers[0]!.maskData]).toEqual(new Array(16).fill(1));
    expect(dataset.layers[0]!.activeCellCount).toBe(16);
  });

  it('does not create extra chunks for GLB floating-point noise at chunk boundaries', () => {
    const dataset = extractVegetation(
      modelWithPrimitives([
        squarePrimitive('surface', 'grass', -0.00001, -0.00001, 4.00001, 4.00001, 2),
      ]),
      createConfig(),
    );

    expect(dataset.grid).toEqual({
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
      chunkSize: 4,
    });
  });

  it('omits chunks without vegetation data', () => {
    const heightSurface = squarePrimitive('surface', 'ground', 0, 0, 8, 4, 0);
    const grassSurface = squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0);
    const dataset = extractVegetation(
      modelWithPrimitives([heightSurface, grassSurface]),
      createConfig(),
    );

    expect(dataset.grid.width).toBe(2);
    expect([...dataset.chunkLookup]).toEqual([0, -1]);
    expect(dataset.chunks).toHaveLength(1);
    expect(dataset.heightData).toHaveLength(9);
    expect(dataset.layers[0]!.maskData).toHaveLength(16);
  });

  it('stores overlapping layers as separate masks with their own resolutions', () => {
    const primitive = squarePrimitive('surface', 'shared', 0, 0, 4, 4, 0);
    const config = createConfig({
      layers: [
        createLayer(3, 'grass', 'shared', 'surface', 4),
        createLayer(9, 'flowers', 'shared', 'surface', 2),
      ],
      allowLayerOverlap: true,
    });
    const dataset = extractVegetation(modelWithPrimitives([primitive]), config);

    expect(dataset.layers.map(({ id, key }) => ({ id, key }))).toEqual([
      { id: 3, key: 'grass' },
      { id: 9, key: 'flowers' },
    ]);
    expect([...dataset.layers[0]!.maskData]).toEqual(new Array(16).fill(1));
    expect([...dataset.layers[1]!.maskData]).toEqual(new Array(4).fill(1));
    expect(dataset.layers.map((layer) => layer.maskResolution)).toEqual([4, 2]);
  });

  it('rejects overlapping layers when overlap is disabled', () => {
    const primitive = squarePrimitive('surface', 'shared', 0, 0, 4, 4, 0);
    const config = createConfig({
      layers: [
        createLayer(3, 'grass', 'shared'),
        createLayer(9, 'flowers', 'shared'),
      ],
      allowLayerOverlap: false,
    });

    expect(() => extractVegetation(modelWithPrimitives([primitive]), config))
      .toThrow('Vegetation layers overlap in chunk (0, 0).');
  });

  it('preserves unquantized sloped height samples for the writer', () => {
    const primitive = slopedSquarePrimitive();
    const dataset = extractVegetation(modelWithPrimitives([primitive]), createConfig());

    expect(dataset.chunks[0]!.minimumHeight).toBe(0);
    expect(dataset.chunks[0]!.maximumHeight).toBe(4);
    expect([...dataset.heightData]).toEqual([
      0, 2, 4,
      0, 2, 4,
      0, 2, 4,
    ]);
  });

  it('uses generated and manual seeds exactly as configured', () => {
    const model = modelWithPrimitives([squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0)]);
    const manual = extractVegetation(model, createConfig());
    const generated = extractVegetation(
      model,
      createConfig({ seedMode: 'generated' }),
      { generateSeed: () => 0xdead_beef },
    );

    expect(manual.seed).toBe(42);
    expect(generated.seed).toBe(0xdead_beef);
  });

  it('matches mesh names across the complete node hierarchy', () => {
    const primitive = {
      ...squarePrimitive('child', 'grass', 0, 0, 4, 4, 0),
      hierarchyNames: ['campus', 'SuRfIcE', 'child'],
    };
    const config = createConfig({
      heightMesh: 'surfice',
      layers: [createLayer(0, 'grass', 'grass', 'surfice')],
    });

    expect(extractVegetation(modelWithPrimitives([primitive]), config).chunks)
      .toHaveLength(1);
  });

  it('rejects invalid coordinate axes and duplicate layer IDs', () => {
    const model = modelWithPrimitives([squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0)]);
    const invalidAxes = {
      ...createConfig(),
      coordinateSystem: {
        space: 'model-local',
        upAxis: 'z',
        horizontalAxes: ['x', 'z'],
        unitsPerMeter: 1,
      },
    } as unknown as VegetationExtractionConfig;
    const duplicateLayers = createConfig({
      layers: [
        createLayer(0, 'grass', 'grass'),
        createLayer(0, 'flowers', 'flowers'),
      ],
    });

    expect(() => extractVegetation(model, invalidAxes)).toThrow('Coordinate axes must be unique.');
    expect(() => extractVegetation(model, duplicateLayers)).toThrow('Vegetation layer IDs must be unique.');
  });

  it('requires every vegetation layer to define its mask resolution', () => {
    const model = modelWithPrimitives([squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0)]);
    const { maskResolution: _removed, ...layerWithoutResolution } = createLayer(0, 'grass', 'grass');
    const config = createConfig({
      layers: [layerWithoutResolution as unknown as ReturnType<typeof createLayer>],
    });

    expect(() => extractVegetation(model, config))
      .toThrow('maskResolution for "grass" must be an integer');
  });
});

type ConfigOverrides = Readonly<{
  layers?: readonly ReturnType<typeof createLayer>[];
  allowLayerOverlap?: boolean;
  seedMode?: 'generated' | 'manual';
  heightMesh?: string;
}>;

function createConfig(overrides: ConfigOverrides = {}): VegetationExtractionConfig {
  return {
    coordinateSystem: {
      space: 'model-local',
      upAxis: 'z',
      horizontalAxes: ['x', 'y'],
      unitsPerMeter: 1,
    },
    source: {
      format: 'glb',
      reader: 'three-gltf-loader',
      includeInvisibleObjects: false,
      heightSurfaceSelector: {
        any: [{
          type: 'mesh-name',
          values: [overrides.heightMesh ?? 'surface'],
          caseSensitive: false,
        }],
      },
    },
    extraction: {
      seed: {
        mode: overrides.seedMode ?? 'manual',
        manualValue: 42,
      },
      grid: {
        strategy: 'fixed-world-size',
        chunkSize: 4,
        origin: { mode: 'snap-to-height-surface-bounds' },
        boundsSource: 'height-surfaces',
        includeEmptyChunks: false,
      },
      heightMap: {
        resolution: 3,
        samplePlacement: 'include-chunk-borders',
      },
      vegetationMask: {
        cellActivation: 'triangle-overlap',
        allowLayerOverlap: overrides.allowLayerOverlap ?? true,
      },
      vegetationLayers: overrides.layers ?? [createLayer(0, 'grass', 'grass')],
    },
  };
}

function createLayer(
  id: number,
  key: string,
  materialName: string,
  meshName = 'surface',
  maskResolution = 4,
) {
  return {
    id,
    key,
    displayName: key,
    enabled: true,
    maskResolution,
    surfaceSelector: {
      all: [
        {
          type: 'mesh-name' as const,
          values: [meshName],
          caseSensitive: false,
        },
        {
          type: 'material-name' as const,
          values: [materialName],
          caseSensitive: false,
        },
      ],
    },
    filters: { maximumSlopeDegrees: 90 },
  } as const;
}

function squarePrimitive(
  meshName: string,
  materialName: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  height: number,
): ModelPrimitive {
  return {
    meshName,
    nodePath: meshName,
    hierarchyNames: [meshName],
    materialName,
    meshUserData: {},
    materialUserData: {},
    positions: new Float32Array([
      minX, minY, height,
      maxX, minY, height,
      maxX, maxY, height,
      minX, maxY, height,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

function slopedSquarePrimitive(): ModelPrimitive {
  return {
    ...squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0),
    positions: new Float32Array([
      0, 0, 0,
      4, 0, 4,
      4, 4, 4,
      0, 4, 0,
    ]),
  };
}

function modelWithPrimitives(primitives: readonly ModelPrimitive[]): ModelData {
  return {
    coordinateSpace: 'model-local',
    primitives,
    bounds: {
      minX: -100,
      minY: -100,
      minZ: -100,
      maxX: 100,
      maxY: 100,
      maxZ: 100,
    },
    sourceMeshCount: primitives.length,
    triangleCount: primitives.reduce((sum, primitive) => sum + primitive.indices.length / 3, 0),
  };
}
