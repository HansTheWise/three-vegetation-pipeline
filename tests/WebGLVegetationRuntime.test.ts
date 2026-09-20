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
  createThreeWebGLVegetationLightingMaterialFactory,
  createVegetationRuntimeDataset,
  createWebGLVegetationRuntime,
  createWebGLGrassLayerModule,
  grassLayerPreparation,
  requireGrassRuntimeLayer,
  writeVegFile,
  type ParsedVegFile,
  type PreparedVegetationRuntime,
  type VegetationPreparationAdapter,
  type VegetationRuntimeLayerConfig,
  type WebGLVegetationLayerModule,
  type WebGLVegetationLightingMaterialFactory,
  type VegetationDataset,
} from '../src/index.js';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';

const identityMatrix = new Float64Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

const grassLayerModule = createWebGLGrassLayerModule();

afterEach(() => vi.restoreAllMocks());

describe('WebGLVegetationRuntime', () => {
  it('uses explicitly registered layer modules for synchronous preparation', async () => {
    const runtime = await createWebGLVegetationRuntime({
      renderer: createRenderer(),
      source: createVegetationFileBytes(),
      config: vegetationRuntimeConfig,
      layerModules: [grassLayerModule],
    });

    expect(runtime.object3d.children).toHaveLength(1);
    expect(runtime.diagnostics.preparationMilliseconds).toBeGreaterThanOrEqual(0);
    runtime.dispose();
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
    const runtime = await createWebGLVegetationRuntime({
      renderer,
      source: createVegetationFileBytes(),
      config: disabledConfig,
      layerModules: [],
    });

    expect(runtime.object3d.children).toHaveLength(0);
    expect(runtime.diagnostics.layers).toEqual([]);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('owns frame updates, diagnostics, layer toggling, and idempotent cleanup', async () => {
    const renderer = createRenderer();
    const prepared = createPreparedRuntime();
    const runtime = await createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(prepared),
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
    expect(runtime.diagnostics.preparationMilliseconds).toBe(12.5);
    runtime.updateFrame({
      cameraPositionModel: { x: 0, y: 0, z: 0 },
      clipFromModelMatrix: identityMatrix,
      clipSpaceDepthRange: 'negative-one-to-one',
    });
    expect(runtime.diagnostics.visibleStoredChunkCount).toBe(1);
    expect(runtime.diagnostics.layers[0]).toMatchObject({
      layerId: 0,
      key: 'meadow-grass',
      enabled: true,
      visibleTileCount: 1,
    });
    expect(runtime.diagnostics.layers[0]!.visibleCandidateCount).toBeGreaterThan(0);

    runtime.setLayerEnabled('meadow-grass', false);
    expect(runtime.object3d.children[0]!.visible).toBe(false);
    runtime.updateFrame({
      cameraPositionModel: { x: 0, y: 0, z: 0 },
      clipFromModelMatrix: identityMatrix,
      clipSpaceDepthRange: 'negative-one-to-one',
    });
    expect(runtime.diagnostics.visibleStoredChunkCount).toBe(0);
    expect(runtime.diagnostics.layers[0]).toMatchObject({
      enabled: false,
      visibleTileCount: 0,
      visibleCandidateCount: 0,
    });

    runtime.setLayerEnabled(0, true);
    expect(runtime.object3d.children[0]!.visible).toBe(true);
    runtime.dispose();
    runtime.dispose();
    expect(runtime.disposed).toBe(true);
    expect(runtime.object3d.children).toHaveLength(0);
    textureDisposals.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    expect(() => runtime.updateFrame({
      cameraPositionModel: { x: 0, y: 0, z: 0 },
      clipFromModelMatrix: identityMatrix,
      clipSpaceDepthRange: 'negative-one-to-one',
    })).toThrow('already disposed');
  });

  it('rejects incomplete prepared layer data before allocating GPU resources', async () => {
    const renderer = createRenderer();
    const source = createPreparedRuntime();
    const layer = {
      ...source.dataset.preparedLayers[0]!,
      preparedProfileData: undefined,
    };
    const prepared = {
      ...source,
      dataset: { ...source.dataset, preparedLayers: [layer] },
    } as PreparedVegetationRuntime;

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(prepared),
      layerModules: [grassLayerModule],
    })).rejects.toThrow('incomplete prepared data');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('routes a custom profile through shared preparation and chunk culling without Grass resources', async () => {
    const renderer = createRenderer();
    const prepared = createPreparedRuntimeWithProfile('test-canopy');
    const object3d = new Group();
    const updateFrame = vi.fn();
    const dispose = vi.fn();
    const module: WebGLVegetationLayerModule = {
      profileType: 'test-canopy',
      prepare: () => { throw new Error('Injected preparation should be used.'); },
      create: vi.fn((context) => {
        expect(context.sharedResources.dataset).toBe(prepared.dataset);
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

    const runtime = await createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(prepared),
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

    runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects an unregistered profile before allocating shared GPU resources', async () => {
    const renderer = createRenderer();

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntimeWithProfile('tree')),
      layerModules: [],
    })).rejects.toThrow('No WebGL vegetation layer renderer is registered for profile "tree".');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('does not register the Grass module implicitly', async () => {
    const renderer = createRenderer();

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
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

    const runtime = await createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
      layerModules: [module],
    });

    expect(module.create).toHaveBeenCalledOnce();
    expect(renderer.initTexture.mock.calls.map(([texture]) => texture.name))
      .not.toContain('vegetation/layer-0-patterns');
    runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('connects a replacement lighting material factory through the Grass module', async () => {
    const threeLightingMaterialFactory = createThreeWebGLVegetationLightingMaterialFactory();
    const createVegetationLightingMaterial = vi.fn((options) => (
      threeLightingMaterialFactory.createVegetationLightingMaterial(options)
    ));
    const lightingMaterialFactory: WebGLVegetationLightingMaterialFactory = {
      createVegetationLightingMaterial,
    };
    const runtime = await createWebGLVegetationRuntime({
      renderer: createRenderer(),
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
      layerModules: [createWebGLGrassLayerModule({ lightingMaterialFactory })],
    });

    expect(createVegetationLightingMaterial).toHaveBeenCalledTimes(5);
    runtime.dispose();
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

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
      layerModules: [grassLayerModule],
    })).rejects.toThrow(`Failed ${failureName}`);
    expect(dispose).toHaveBeenCalledTimes(renderer.initTexture.mock.calls.length);
  });

  it('releases geometry and prior GPU resources when layer material creation fails', async () => {
    const textureDispose = vi.spyOn(DataTexture.prototype, 'dispose');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const renderer = createRenderer();
    const prepared = createPreparedRuntime();
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
    } as PreparedVegetationRuntime;

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(invalidPrepared),
      layerModules: [grassLayerModule],
    })).rejects.toThrow('needs a ground patch field');
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledTimes(renderer.initTexture.mock.calls.length);
  });

  it('propagates preparation failures without touching WebGL', async () => {
    const renderer = createRenderer();
    const preparation: VegetationPreparationAdapter = {
      prepare: vi.fn(() => { throw new Error('Preparation failed'); }),
    };

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation,
      layerModules: [grassLayerModule],
    })).rejects.toThrow('Preparation failed');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });
});

describe('ThreeVegetationSceneBinding', () => {
  it('uses a complete custom layer module through the direct Three.js binding', async () => {
    const renderer = createRenderer();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const object3d = new Group();
    const prepare = vi.fn(() => ({
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
      prepare,
      create,
    };
    const layer: VegetationRuntimeLayerConfig = {
      layerId: 0,
      key: 'canopy',
      enabled: true,
      renderProfile: { type: 'test-canopy' },
    };
    const vegetation = await createThreeVegetationSceneBinding({
      renderer,
      scene,
      camera,
      source: createVegetationFileBytes(),
      config: { configVersion: 3, layers: [layer] },
      layerModules: [module],
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(vegetation.object3d.parent).toBe(scene);
    expect(vegetation.object3d.children).toEqual([object3d]);
    vegetation.dispose();
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
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
      layerModules: [grassLayerModule],
    });

    expect(binding.object3d.parent).toBe(vegetationParent);
    binding.updateFrame();
    expect(binding.diagnostics.visibleStoredChunkCount).toBe(1);
    binding.setLayerEnabled(0, false);
    expect(binding.diagnostics.layers[0]!.enabled).toBe(false);

    binding.dispose();
    binding.dispose();
    expect(binding.object3d.parent).toBeNull();
    expect(binding.runtime.disposed).toBe(true);
    expect(() => binding.updateFrame()).toThrow('already disposed');
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
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
      layerModules: [grassLayerModule],
    });

    binding.updateFrame();
    expect(frameStateProvider.updateFrameState).toHaveBeenCalledOnce();
    expect(binding.diagnostics.visibleStoredChunkCount).toBe(1);
    binding.dispose();
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

function createPreparation(
  prepared: PreparedVegetationRuntime,
): VegetationPreparationAdapter {
  return { prepare: vi.fn(() => prepared) };
}

function createPreparedRuntime(): PreparedVegetationRuntime {
  const dataset = createVegetationRuntimeDataset(
    createParsedFile(),
    vegetationRuntimeConfig,
    [grassLayerPreparation],
  );
  return {
    dataset,
    preparationMilliseconds: 12.5,
  };
}

function createPreparedRuntimeWithProfile(profileType: string): PreparedVegetationRuntime {
  const prepared = createPreparedRuntime();
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
      seed: 42,
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
      heightMap: { resolution: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.of(0),
    chunkHeightRanges: Float32Array.of(0, 0),
    heightData: Uint16Array.of(0, 0, 0, 0),
    layers: [{
      id: 0,
      maskResolution: 2,
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
    seed: 42,
    grid: { width: 1, height: 1, chunkSize: 1, originX: -0.5, originY: -0.5 },
    heightMap: { resolution: 2 },
    chunkLookup: Int32Array.of(0),
    storedChunkHeightRanges: [{ minimumHeight: 0, maximumHeight: 0 }],
    heightData: Float64Array.of(0, 0, 0, 0),
    layers: [{
      id: 0,
      key: 'meadow-grass',
      maskResolution: 2,
      maskData: Uint8Array.of(1, 1, 1, 1),
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}
