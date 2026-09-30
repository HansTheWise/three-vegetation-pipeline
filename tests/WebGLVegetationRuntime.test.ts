import {
  BufferGeometry,
  DataTexture,
  Group,
  PerspectiveCamera,
  Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createThreeVegetationSceneBinding,
  createThreeWebGLGrassLightingMaterialFactory,
  createVegetationRuntimeManager,
  createPreparedVegetationDataset,
  createWebGLGrassLayerModule,
  VegFileDatasetCreationManager,
  grassLayerPreparation,
  requireGrassRuntimeLayer,
  writeVegFile,
  type ParsedVegFile,
  type VegetationDatasetCreationResult,
  type VegFileDatasetCreationAdapter,
  type VegetationRuntimeLayerConfig,
  type VegetationLayerPreparation,
  type VegetationDataset,
  type WebGLVegetationLayerModule,
  type WebGLGrassLightingMaterialFactory,
  type PreparedVegetationDataset,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';

const identityMatrix = new Float64Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

const grassLayerModule = createWebGLGrassLayerModule();

afterEach(() => vi.restoreAllMocks());

describe('VegetationRuntimeManager', () => {
  it('uses the explicitly supplied dataset creation adapter and layer modules', async () => {
    const runtime = await createVegetationRuntimeManager({
      renderer: createRenderer(),
      vegFileBytes: createVegetationFileBytes(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createMainThreadTestDatasetCreationAdapter([
        grassLayerPreparation,
      ]),
      layerModules: [grassLayerModule],
    });

    expect(runtime.object3d.children).toHaveLength(1);
    expect(runtime.diagnostics.datasetCreationMilliseconds).toBeGreaterThanOrEqual(0);
    runtime.destroy();
  });

  it('allocates no WebGL resources when every configured layer is disabled', async () => {
    const renderer = createRenderer();
    const disabledConfig = {
      ...vegetationRuntimeConfig,
      layers: vegetationRuntimeConfig.layers.map((layer) => ({
        ...layer,
        enabled: false,
      })),
    };
    const runtime = await createVegetationRuntimeManager({
      renderer,
      vegFileBytes: createVegetationFileBytes(),
      vegetationRuntimeConfig: disabledConfig,
      datasetCreationAdapter: createMainThreadTestDatasetCreationAdapter([]),
      layerModules: [],
    });

    expect(runtime.object3d.children).toHaveLength(0);
    expect(runtime.diagnostics.layers).toEqual([]);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it('owns frame updates, diagnostics, and idempotent cleanup', async () => {
    const renderer = createRenderer();
    const prepared = createDatasetCreationResult();
    const runtime = await createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(prepared),
      layerModules: [grassLayerModule],
    });
    const textures = renderer.initTexture.mock.calls.map(([texture]) => texture as Texture);
    const textureDisposals = textures.map(() => vi.fn());
    textures.forEach((texture, index) => texture.addEventListener(
      'dispose',
      textureDisposals[index]!,
    ));

    expect(runtime.object3d.name).toBe('vegetation/runtime');
    expect(runtime.object3d.children).toHaveLength(1);
    expect(runtime.diagnostics.datasetCreationMilliseconds).toBe(12.5);
    runtime.updateFrame({
      cameraPositionModel: { x: 0, y: 0, z: 0 },
      clipFromModelMatrix: identityMatrix,
      clipSpaceDepthRange: 'negative-one-to-one',
    });
    expect(runtime.diagnostics.visibleStoredChunkCount).toBe(1);
    expect(runtime.diagnostics.layers[0]).toMatchObject({
      vegetationLayerId: 0,
      vegetationLayerKey: 'meadow-grass',
      visibleTileCount: 1,
    });
    expect(runtime.diagnostics.layers[0]!.visibleCandidateCount).toBeGreaterThan(0);
    runtime.destroy();
    runtime.destroy();
    expect(runtime.destroyed).toBe(true);
    expect(runtime.object3d.children).toHaveLength(0);
    textureDisposals.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    expect(() => runtime.updateFrame({
      cameraPositionModel: { x: 0, y: 0, z: 0 },
      clipFromModelMatrix: identityMatrix,
      clipSpaceDepthRange: 'negative-one-to-one',
    })).toThrow('already destroyed');
  });

  it('rejects incomplete prepared layer data before allocating GPU resources', async () => {
    const renderer = createRenderer();
    const source = createDatasetCreationResult();
    const layer = {
      ...source.dataset.preparedLayers[0]!,
      preparedProfileData: undefined,
    };
    const prepared = {
      ...source,
      dataset: { ...source.dataset, preparedLayers: [layer] },
    } as VegetationDatasetCreationResult;

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(prepared),
      layerModules: [grassLayerModule],
    })).rejects.toThrow('incomplete prepared data');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('routes a custom profile through shared preparation and chunk culling without Grass resources', async () => {
    const renderer = createRenderer();
    const prepared = createDatasetCreationResultWithProfile('test-canopy');
    const object3d = new Group();
    const updateFrame = vi.fn();
    const dispose = vi.fn();
    const module: WebGLVegetationLayerModule = {
      profileType: 'test-canopy',
      createPreparedVegetationLayerProfile: () => {
        throw new Error('Injected preparation should be used.');
      },
      create: vi.fn((context) => {
        expect(context.vegetationDataset).toBe(prepared.dataset);
        expect(context.layer).toBe(prepared.dataset.preparedLayers[0]);
        expect(context.layer.preparedProfileData).toEqual({ canopySeed: 42 });
        return {
          object3d,
          diagnostics: {
            visibleTileCount: 3,
            visibleCandidateCount: 5,
            executedCandidateCount: 8,
            frustumTestedTileCount: 4,
            frustumCulledTileCount: 1,
          },
          updateFrame,
          dispose,
        };
      }),
    };

    const runtime = await createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(prepared),
      layerModules: [module],
    });
    const textureNames = renderer.initTexture.mock.calls.map(([texture]) => texture.name);
    expect(textureNames).not.toContain('vegetation/layer-0-patterns');
    expect(textureNames).not.toContain('vegetation/layer-0-bottom-colors');
    expect(runtime.object3d.children).toEqual([object3d]);

    const frameState = {
      cameraPositionModel: { x: 0, y: 0, z: 0 },
      clipFromModelMatrix: identityMatrix,
      clipSpaceDepthRange: 'negative-one-to-one' as const,
    };
    runtime.updateFrame(frameState);
    expect(updateFrame).toHaveBeenCalledWith(frameState);
    expect(runtime.diagnostics.visibleStoredChunkCount).toBe(1);
    expect(runtime.diagnostics.layers[0]).toMatchObject({
      profileType: 'test-canopy',
      visibleTileCount: 3,
      visibleCandidateCount: 5,
      executedCandidateCount: 8,
      frustumTestedTileCount: 4,
      frustumCulledTileCount: 1,
    });

    runtime.destroy();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects an unregistered profile before allocating shared GPU resources', async () => {
    const renderer = createRenderer();

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(
        createDatasetCreationResultWithProfile('tree'),
      ),
      layerModules: [],
    })).rejects.toThrow('No WebGL vegetation layer renderer is registered for profile "tree".');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('does not register the Grass module implicitly', async () => {
    const renderer = createRenderer();

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(createDatasetCreationResult()),
      layerModules: [],
    })).rejects.toThrow('No WebGL vegetation layer renderer is registered for profile "grass".');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('uses only the explicitly registered Grass module', async () => {
    const renderer = createRenderer();
    const dispose = vi.fn();
    const module: WebGLVegetationLayerModule = {
      ...grassLayerPreparation,
      create: vi.fn(() => ({
        object3d: new Group(),
        diagnostics: {
          visibleTileCount: 0,
          visibleCandidateCount: 0,
          executedCandidateCount: 0,
          frustumTestedTileCount: 0,
          frustumCulledTileCount: 0,
        },
        updateFrame: vi.fn(),
        dispose,
      })),
    };

    const runtime = await createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(createDatasetCreationResult()),
      layerModules: [module],
    });

    expect(module.create).toHaveBeenCalledOnce();
    expect(renderer.initTexture.mock.calls.map(([texture]) => texture.name))
      .not.toContain('vegetation/layer-0-patterns');
    runtime.destroy();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('connects a replacement lighting material factory through the Grass module', async () => {
    const threeGrassLightingMaterialFactory = createThreeWebGLGrassLightingMaterialFactory();
    const createGrassLightingMaterial = vi.fn((options) => (
      threeGrassLightingMaterialFactory.createGrassLightingMaterial(options)
    ));
    const grassLightingMaterialFactory: WebGLGrassLightingMaterialFactory = {
      createGrassLightingMaterial,
    };
    const runtime = await createVegetationRuntimeManager({
      renderer: createRenderer(),
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(createDatasetCreationResult()),
      layerModules: [createWebGLGrassLayerModule({ grassLightingMaterialFactory })],
    });

    expect(createGrassLightingMaterial).toHaveBeenCalledTimes(5);
    runtime.destroy();
  });

  it.each([
    'vegetation/chunk-height-ranges',
    'vegetation/visible-stored-chunk-indices',
    'vegetation/layer-0-patterns',
    'vegetation/layer-0-bottom-colors',
    'vegetation/layer-0-density-tiles',
    'vegetation/layer-0-active-cells',
  ])('releases every allocated texture when %s creation fails', async (failureName) => {
    const dispose = vi.spyOn(DataTexture.prototype, 'dispose');
    const renderer = createRenderer(failureName);

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(createDatasetCreationResult()),
      layerModules: [grassLayerModule],
    })).rejects.toThrow(`Failed ${failureName}`);
    expect(dispose).toHaveBeenCalledTimes(renderer.initTexture.mock.calls.length);
  });

  it('releases geometry and prior GPU resources when layer material creation fails', async () => {
    const textureDispose = vi.spyOn(DataTexture.prototype, 'dispose');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const renderer = createRenderer();
    const prepared = createDatasetCreationResult();
    const layer = prepared.dataset.preparedLayers[0]!;
    const grassData = requireGrassRuntimeLayer(layer).preparedProfileData;
    const profile = vegetationRuntimeConfig.layers[0]!.renderProfile;
    const invalidLayer = {
      ...layer,
      config: {
        ...layer.config,
        renderProfile: {
          ...profile,
          colors: {
            ...profile.colors,
            groundColorAdaptation: { bottomBias: 0.5, topBias: 0.5 },
          },
        },
      },
      preparedProfileData: { ...grassData, groundPatchField: undefined },
    };
    const invalidPrepared = {
      ...prepared,
      dataset: {
        ...prepared.dataset,
        preparedLayers: [invalidLayer],
      },
    } as VegetationDatasetCreationResult;

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(invalidPrepared),
      layerModules: [grassLayerModule],
    })).rejects.toThrow('needs a ground patch field');
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledTimes(renderer.initTexture.mock.calls.length);
  });

  it('propagates dataset creation failures without touching WebGL', async () => {
    const renderer = createRenderer();
    const datasetCreationAdapter: VegFileDatasetCreationAdapter = {
      createVegetationDataset: vi.fn(() => {
        throw new Error('Dataset creation failed');
      }),
    };

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter,
      layerModules: [grassLayerModule],
    })).rejects.toThrow('Dataset creation failed');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('stops before WebGL setup when runtime creation is canceled during dataset creation', async () => {
    const renderer = createRenderer();
    const cancellationController = new AbortController();
    const datasetCreationAdapter: VegFileDatasetCreationAdapter = {
      createVegetationDataset: () => {
        cancellationController.abort();
        return createDatasetCreationResult();
      },
    };

    await expect(createVegetationRuntimeManager({
      renderer,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter,
      layerModules: [grassLayerModule],
      cancellationSignal: cancellationController.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });
});

describe('ThreeVegetationSceneBinding', () => {
  it('uses a complete custom layer module through the direct Three.js binding', async () => {
    const renderer = createRenderer();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const object3d = new Group();
    const createPreparedVegetationLayerProfile = vi.fn(() => ({
      cullingBounds: {
        horizontalPaddingMeters: 2,
        belowSurfaceMeters: 0,
        aboveSurfaceMeters: 8,
      },
      preparedProfileData: { canopySeed: 42 },
    }));
    const create = vi.fn((context) => {
      expect(context.layer.preparedProfileData).toEqual({ canopySeed: 42 });
      return {
        object3d,
        diagnostics: {
          visibleTileCount: 0,
          visibleCandidateCount: 0,
          executedCandidateCount: 0,
          frustumTestedTileCount: 0,
          frustumCulledTileCount: 0,
        },
        updateFrame: vi.fn(),
        dispose: vi.fn(),
      };
    });
    const module: WebGLVegetationLayerModule = {
      profileType: 'test-canopy',
      createPreparedVegetationLayerProfile,
      create,
    };
    const layer: VegetationRuntimeLayerConfig = {
      vegetationLayerId: 0,
      vegetationLayerKey: 'canopy',
      enabled: true,
      renderProfile: { type: 'test-canopy' },
    };
    const vegetation = await createThreeVegetationSceneBinding({
      renderer,
      scene,
      camera,
      vegFileBytes: createVegetationFileBytes(),
      vegetationRuntimeConfig: { configVersion: 3, layers: [layer] },
      datasetCreationAdapter: createMainThreadTestDatasetCreationAdapter([module]),
      layerModules: [module],
    });

    expect(createPreparedVegetationLayerProfile).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(vegetation.object3d.parent).toBe(scene);
    expect(vegetation.object3d.children).toEqual([object3d]);
    vegetation.destroy();
  });

  it('binds the runtime to the vegetation parent and owns frame updates and cleanup', async () => {
    const scene = new Scene();
    const vegetationParent = new Scene();
    vegetationParent.position.set(2, 0, 0);
    scene.add(vegetationParent);
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(2, 1, 2);
    camera.lookAt(2, 0, 0);
    const binding = await createThreeVegetationSceneBinding({
      renderer: createRenderer(),
      scene,
      camera,
      vegetationParent,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(createDatasetCreationResult()),
      layerModules: [grassLayerModule],
    });

    expect(binding.object3d.parent).toBe(vegetationParent);
    binding.updateFrame();
    expect(binding.diagnostics.visibleStoredChunkCount).toBe(1);

    binding.destroy();
    binding.destroy();
    expect(binding.object3d.parent).toBeNull();
    expect(binding.runtime.destroyed).toBe(true);
    expect(() => binding.updateFrame()).toThrow('already destroyed');
  });

  it('accepts a replacement frame-state provider without changing dataset or layer config', async () => {
    const scene = new Scene();
    const frameStateProvider = {
      updateFrameState: vi.fn(() => ({
        cameraPositionModel: { x: 0, y: 0, z: 0 },
        clipFromModelMatrix: identityMatrix,
        clipSpaceDepthRange: 'negative-one-to-one' as const,
      })),
    };
    const binding = await createThreeVegetationSceneBinding({
      renderer: createRenderer(),
      scene,
      camera: new PerspectiveCamera(),
      frameStateProvider,
      vegFileBytes: new Uint8Array(),
      vegetationRuntimeConfig,
      datasetCreationAdapter: createDatasetCreationAdapter(createDatasetCreationResult()),
      layerModules: [grassLayerModule],
    });

    binding.updateFrame();
    expect(frameStateProvider.updateFrameState).toHaveBeenCalledOnce();
    expect(binding.diagnostics.visibleStoredChunkCount).toBe(1);
    binding.destroy();
  });
});

function createRenderer(failureName?: string) {
  const initTexture = vi.fn((texture: Texture) => {
    if (texture.name === failureName) throw new Error(`Failed ${failureName}`);
  });
  return {
    capabilities: { maxTextureSize: 4096 },
    initTexture,
  } as unknown as WebGLRenderer & { initTexture: typeof initTexture };
}

function createDatasetCreationAdapter(
  datasetCreationResult: VegetationDatasetCreationResult,
): VegFileDatasetCreationAdapter {
  return { createVegetationDataset: vi.fn(() => datasetCreationResult) };
}

function createMainThreadTestDatasetCreationAdapter(
  layerPreparations: readonly VegetationLayerPreparation[],
): VegFileDatasetCreationAdapter {
  const datasetCreationManager = new VegFileDatasetCreationManager(layerPreparations);
  return {
    createVegetationDataset: (vegFileBytes, vegetationRuntimeConfig) => (
      datasetCreationManager.createVegetationDataset(
        vegFileBytes,
        vegetationRuntimeConfig,
      )
    ),
  };
}

function createDatasetCreationResult(): VegetationDatasetCreationResult {
  const dataset = createPreparedVegetationDataset(
    createParsedFile(),
    vegetationRuntimeConfig,
    [grassLayerPreparation],
  );
  return {
    dataset,
    datasetCreationMilliseconds: 12.5,
  };
}

function createDatasetCreationResultWithProfile(
  profileType: string,
): VegetationDatasetCreationResult {
  const prepared = createDatasetCreationResult();
  const sourceLayer = prepared.dataset.preparedLayers[0]!;
  const layer = {
    ...sourceLayer,
    config: {
      ...sourceLayer.config,
      renderProfile: { type: profileType },
    },
    preparedProfileData: { canopySeed: 42 },
  };
  return {
    ...prepared,
    dataset: {
      ...prepared.dataset,
      preparedLayers: [layer],
    },
  };
}

function createParsedFile(): ParsedVegFile {
  return {
    bytes: new Uint8Array(),
    header: {
      version: 2,
      vegetationSeed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: {
        minX: -0.5, minY: 0, minZ: -0.5,
        maxX: 0.5, maxY: 0, maxZ: 0.5,
      },
      coordinateSystem: {
        upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1,
      },
      grid: { width: 1, height: 1, chunkSize: 1, originX: -0.5, originY: -0.5 },
      storedChunkCount: 1,
      heightMap: { resolutionPerChunkAxis: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.of(0),
    chunkHeightRanges: Float32Array.of(0, 0),
    heightData: Uint16Array.of(0, 0, 0, 0),
    layers: [{
      vegetationLayerId: 0,
      maskResolutionPerChunkAxis: 2,
      maskWordsPerChunk: 1,
      maskData: Uint32Array.of(0b1111),
    }],
  };
}

function createVegetationFileBytes(): Uint8Array {
  const dataset: VegetationDataset = {
    sourceBounds: {
      minX: -0.5, minY: 0, minZ: -0.5,
      maxX: 0.5, maxY: 0, maxZ: 0.5,
    },
    coordinateSystem: {
      upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1,
    },
    vegetationSeed: 42,
    grid: { width: 1, height: 1, chunkSize: 1, originX: -0.5, originY: -0.5 },
    heightMap: { resolutionPerChunkAxis: 2 },
    chunkLookup: Int32Array.of(0),
    storedChunkHeightRanges: [{ minimumHeight: 0, maximumHeight: 0 }],
    heightData: Float64Array.of(0, 0, 0, 0),
    layers: [{
      vegetationLayerId: 0,
      vegetationLayerKey: 'meadow-grass',
      maskResolutionPerChunkAxis: 2,
      maskData: Uint8Array.of(1, 1, 1, 1),
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}
