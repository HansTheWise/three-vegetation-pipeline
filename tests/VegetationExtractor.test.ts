import { describe, expect, it } from 'vitest';
import type {
  ResolvedVegetationExtractionConfig,
  VegetationExtractionConfig,
} from '../src/pre-runtime-compiler-core/configuration/VegetationCompilerConfig.js';
import { resolveVegetationExtractionConfig } from '../src/pre-runtime-compiler-core/configuration/validateVegetationCompilerConfig.js';
import { extractVegetation } from '../src/pre-runtime-compiler-core/vegetation-dataset-extraction/VegetationExtractorManager.js';
import type { ModelData, ModelPrimitive } from '../src/pre-runtime-compiler-core/glb-model-reading/ModelInputTypes.js';

describe('extractVegetation', () => {
  it('extracts a flat Z-up surface into one chunk', () => {
    const dataset = extractVegetation(
      modelWithPrimitives([squarePrimitive('surface', 'grass', 0, 0, 4, 4, 2)]),
      createConfig(),
    );

    expect(dataset.vegetationSeed).toBe(42);
    expect(dataset.grid).toEqual({
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
      chunkSize: 4,
    });
    expect([...dataset.chunkLookup]).toEqual([0]);
    expect(dataset.storedChunkHeightRanges).toEqual([{
      minimumHeight: 2,
      maximumHeight: 2,
    }]);
    expect([...dataset.heightData]).toEqual(new Array(9).fill(2));
    expect([...dataset.layers[0]!.maskData]).toEqual(new Array(16).fill(1));
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
    expect(dataset.storedChunkHeightRanges).toHaveLength(1);
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
      allowVegetationLayerOverlap: true,
    });
    const dataset = extractVegetation(modelWithPrimitives([primitive]), config);

    expect(dataset.layers.map(({ vegetationLayerId, vegetationLayerKey }) => ({
      vegetationLayerId,
      vegetationLayerKey,
    }))).toEqual([
      { vegetationLayerId: 3, vegetationLayerKey: 'grass' },
      { vegetationLayerId: 9, vegetationLayerKey: 'flowers' },
    ]);
    expect([...dataset.layers[0]!.maskData]).toEqual(new Array(16).fill(1));
    expect([...dataset.layers[1]!.maskData]).toEqual(new Array(4).fill(1));
    expect(dataset.layers.map((layer) => layer.maskResolutionPerChunkAxis)).toEqual([4, 2]);
  });

  it('rejects overlapping layers when overlap is disabled', () => {
    const primitive = squarePrimitive('surface', 'shared', 0, 0, 4, 4, 0);
    const config = createConfig({
      layers: [
        createLayer(3, 'grass', 'shared'),
        createLayer(9, 'flowers', 'shared'),
      ],
      allowVegetationLayerOverlap: false,
    });

    expect(() => extractVegetation(modelWithPrimitives([primitive]), config))
      .toThrow('Vegetation layers overlap in chunk (0, 0).');
  });

  it('preserves unquantized sloped height samples for the writer', () => {
    const primitive = slopedSquarePrimitive();
    const dataset = extractVegetation(modelWithPrimitives([primitive]), createConfig());

    expect(dataset.storedChunkHeightRanges[0]!.minimumHeight).toBe(0);
    expect(dataset.storedChunkHeightRanges[0]!.maximumHeight).toBe(4);
    expect([...dataset.heightData]).toEqual([
      0, 2, 4,
      0, 2, 4,
      0, 2, 4,
    ]);
  });

  it('does not clamp heights from outside a chunk onto its sample grid', () => {
    const primitive = multiChunkSlopedTrianglePrimitive();
    const dataset = extractVegetation(modelWithPrimitives([primitive]), createConfig());

    expect(dataset.storedChunkHeightRanges).toEqual([
      { minimumHeight: 0, maximumHeight: 4 },
      { minimumHeight: 4, maximumHeight: 8 },
    ]);
    expect([...dataset.heightData]).toEqual([
      0, 2, 4,
      0, 2, 4,
      0, 2, 4,
      4, 6, 8,
      4, 6, 8,
      4, 6, 8,
    ]);
  });

  it('seeds a heightmap when a narrow surface misses every grid sample', () => {
    const primitive = narrowTrianglePrimitive();
    const dataset = extractVegetation(modelWithPrimitives([primitive]), createConfig());

    expect(dataset.storedChunkHeightRanges).toEqual([
      { minimumHeight: 5, maximumHeight: 5 },
    ]);
    expect([...dataset.heightData]).toEqual(new Array(9).fill(5));
  });

  it('uses seed 0 when no vegetation seed is configured', () => {
    const model = modelWithPrimitives([squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0)]);
    const configured = extractVegetation(model, createConfig());
    const defaulted = extractVegetation(model, createConfig({ omitVegetationSeed: true }));

    expect(configured.vegetationSeed).toBe(42);
    expect(defaulted.vegetationSeed).toBe(0);
  });

  it('matches names across the complete node hierarchy', () => {
    const primitive = {
      ...squarePrimitive('child', 'grass', 0, 0, 4, 4, 0),
      hierarchyNodeNames: ['world', 'TeRrAiN', 'child'],
    };
    const config = createConfig({
      heightMesh: 'terrain',
      layers: [createLayer(0, 'grass', 'grass', 'terrain')],
    });

    expect(extractVegetation(
      modelWithPrimitives([primitive]),
      config,
    ).storedChunkHeightRanges)
      .toHaveLength(1);
  });

  it('removes cells covered by configured hierarchy-name prefixes', () => {
    const ground = squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0);
    const building = {
      ...squarePrimitive('roof', 'building', 0, 0, 2, 4, 3),
      hierarchyNodeNames: ['world', 'Haus_20', 'roof'],
    };
    const layer = {
      ...createLayer(0, 'grass', 'grass'),
      excludedSurfaceSelection: {
        matchAny: [{
          property: 'hierarchyNodeNamePrefix' as const,
          acceptedPrefixes: ['haus_'],
          caseSensitive: false,
        }],
      },
    };

    const dataset = extractVegetation(
      modelWithPrimitives([ground, building]),
      createConfig({ layers: [layer] }),
    );

    expect([...dataset.layers[0]!.maskData]).toEqual([
      0, 0, 1, 1,
      0, 0, 1, 1,
      0, 0, 1, 1,
      0, 0, 1, 1,
    ]);
  });

  it('rejects invalid coordinate axes and duplicate layer IDs', () => {
    const invalidAxes = {
      ...createConfig(),
      coordinateSystem: {
        upAxis: 'z',
        horizontalAxes: ['x', 'z'],
        unitsPerMeter: 1,
      },
    } as unknown as VegetationExtractionConfig;
    const duplicateLayers = createUnresolvedConfig({
      layers: [
        createLayer(0, 'grass', 'grass'),
        createLayer(0, 'flowers', 'flowers'),
      ],
    });

    expect(() => resolveVegetationExtractionConfig(invalidAxes))
      .toThrow('Coordinate axes must be unique.');
    expect(() => resolveVegetationExtractionConfig(duplicateLayers))
      .toThrow('Vegetation layer IDs must be unique.');
  });

  it('requires every vegetation layer to define its mask resolution', () => {
    const { maskResolutionPerChunkAxis: _removed, ...layerWithoutResolution } = createLayer(0, 'grass', 'grass');
    expect(() => createConfig({
      layers: [layerWithoutResolution as unknown as ReturnType<typeof createLayer>],
    })).toThrow(
      'Vegetation extraction config.vegetationLayers[0].maskResolutionPerChunkAxis must be a finite number.',
    );
  });
});

type ConfigOverrides = Readonly<{
  layers?: readonly ReturnType<typeof createLayer>[];
  allowVegetationLayerOverlap?: boolean;
  omitVegetationSeed?: boolean;
  heightMesh?: string;
}>;

function createConfig(overrides: ConfigOverrides = {}): ResolvedVegetationExtractionConfig {
  return resolveVegetationExtractionConfig(createUnresolvedConfig(overrides));
}

function createUnresolvedConfig(overrides: ConfigOverrides = {}): VegetationExtractionConfig {
  return {
    coordinateSystem: {
      upAxis: 'z',
      horizontalAxes: ['x', 'y'],
      unitsPerMeter: 1,
    },
    ...(overrides.omitVegetationSeed ? {} : { vegetationSeed: 42 }),
    grid: {
      chunkSize: 4,
    },
    heightMap: {
      resolutionPerChunkAxis: 3,
      sourceSurfaceSelection: {
        matchAny: [{
          property: 'hierarchyNodeName',
          acceptedNames: [overrides.heightMesh ?? 'surface'],
          caseSensitive: false,
        }],
      },
    },
    allowVegetationLayerOverlap: overrides.allowVegetationLayerOverlap ?? true,
    vegetationLayers: overrides.layers ?? [createLayer(0, 'grass', 'grass')],
  };
}

function createLayer(
  vegetationLayerId: number,
  vegetationLayerKey: string,
  materialName: string,
  hierarchyNodeName = 'surface',
  maskResolutionPerChunkAxis = 4,
) {
  return {
    vegetationLayerId,
    vegetationLayerKey,
    maskResolutionPerChunkAxis,
    includedSurfaceSelection: {
      matchAll: [
        {
          property: 'hierarchyNodeName' as const,
          acceptedNames: [hierarchyNodeName],
          caseSensitive: false,
        },
        {
          property: 'materialName' as const,
          acceptedNames: [materialName],
          caseSensitive: false,
        },
      ],
    },
    filters: { maximumSlopeDegrees: 90 },
  } as const;
}

function squarePrimitive(
  hierarchyNodeName: string,
  materialName: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  height: number,
): ModelPrimitive {
  return {
    hierarchyNodeNames: [hierarchyNodeName],
    materialName,
    modelLocalVertexPositions: new Float32Array([
      minX, minY, height,
      maxX, minY, height,
      maxX, maxY, height,
      minX, maxY, height,
    ]),
    triangleVertexIndices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

function slopedSquarePrimitive(): ModelPrimitive {
  return {
    ...squarePrimitive('surface', 'grass', 0, 0, 4, 4, 0),
    modelLocalVertexPositions: new Float32Array([
      0, 0, 0,
      4, 0, 4,
      4, 4, 4,
      0, 4, 0,
    ]),
  };
}

function multiChunkSlopedTrianglePrimitive(): ModelPrimitive {
  return {
    hierarchyNodeNames: ['surface'],
    materialName: 'grass',
    modelLocalVertexPositions: new Float32Array([
      0, 0, 0,
      8, 0, 8,
      0, 4, 0,
    ]),
    triangleVertexIndices: new Uint32Array([0, 1, 2]),
  };
}

function narrowTrianglePrimitive(): ModelPrimitive {
  return {
    hierarchyNodeNames: ['surface'],
    materialName: 'grass',
    modelLocalVertexPositions: new Float32Array([
      0.9, 0.9, 5,
      1.1, 0.9, 5,
      1, 1.1, 5,
    ]),
    triangleVertexIndices: new Uint32Array([0, 1, 2]),
  };
}

function modelWithPrimitives(primitives: readonly ModelPrimitive[]): ModelData {
  return {
    primitives,
    modelLocalBounds: {
      minX: -100,
      minY: -100,
      minZ: -100,
      maxX: 100,
      maxY: 100,
      maxZ: 100,
    },
  };
}
