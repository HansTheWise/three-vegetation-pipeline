import {
  BufferGeometry,
  DataTexture,
  PerspectiveCamera,
  Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createThreeVegetation,
  createVegetationActiveCellData,
  createVegetationRuntimeDataset,
  createWebGLVegetationRuntime,
  writeVegFile,
  type ParsedVegFile,
  type PreparedVegetationRuntime,
  type VegetationPreparationAdapter,
  type VegetationDataset,
} from '../src/index.js';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';

const identityMatrix = new Float64Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

afterEach(() => vi.restoreAllMocks());

describe('WebGLVegetationRuntime', () => {
  it('uses the built-in synchronous preparation for VEGFILE bytes', async () => {
    const runtime = await createWebGLVegetationRuntime({
      renderer: createRenderer(),
      source: createVegetationFileBytes(),
      config: vegetationRuntimeConfig,
    });

    expect(runtime.object3d.children).toHaveLength(1);
    expect(runtime.diagnostics.preparationMilliseconds).toBeGreaterThanOrEqual(0);
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
    expect(runtime.diagnostics.visibleChunkCount).toBe(1);
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
    expect(runtime.diagnostics.visibleChunkCount).toBe(0);
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
    const prepared = { ...createPreparedRuntime(), activeCells: [] };

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(prepared),
    })).rejects.toThrow('missing enabled layer 0');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it.each([
    'vegetation/chunk-height-ranges',
    'vegetation/visible-chunk-indices',
    'vegetation/layer-0-active-cells',
  ])('releases every allocated texture when %s creation fails', async (failureName) => {
    const dispose = vi.spyOn(DataTexture.prototype, 'dispose');
    const renderer = createRenderer(failureName);

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
    })).rejects.toThrow(`Failed ${failureName}`);
    expect(dispose).toHaveBeenCalledTimes(renderer.initTexture.mock.calls.length);
  });

  it('releases geometry and prior GPU resources when layer material creation fails', async () => {
    const textureDispose = vi.spyOn(DataTexture.prototype, 'dispose');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const renderer = createRenderer();
    const prepared = createPreparedRuntime();
    const layer = prepared.dataset.enabledLayers[0]!;
    const profile = vegetationRuntimeConfig.layers[0]!.renderProfile;
    const invalidLayer = {
      ...layer,
      config: {
        ...layer.config,
        renderProfile: {
          ...profile,
          colors: {
            ...profile.colors,
            distanceColorTransition: {
              target: 'ground',
              bottom: { startsAtMeters: 1, endsAtMeters: 2, curveStrength: 1 },
              top: { startsAtMeters: 1, endsAtMeters: 2, curveStrength: 1 },
            },
          },
        },
      },
      groundPatchField: undefined,
    };
    const invalidPrepared = {
      ...prepared,
      dataset: {
        ...prepared.dataset,
        layers: [invalidLayer],
        enabledLayers: [invalidLayer],
      },
    } as PreparedVegetationRuntime;

    await expect(createWebGLVegetationRuntime({
      renderer,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(invalidPrepared),
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
    })).rejects.toThrow('Preparation failed');
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });
});

describe('ThreeVegetationSceneAdapter', () => {
  it('binds the runtime to the coordinate root and owns frame updates and cleanup', async () => {
    const scene = new Scene();
    const coordinateRoot = new Scene();
    coordinateRoot.position.set(2, 0, 0);
    scene.add(coordinateRoot);
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(2, 1, 2);
    camera.lookAt(2, 0, 0);
    const adapter = await createThreeVegetation({
      renderer: createRenderer(),
      scene,
      camera,
      coordinateRoot,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
    });

    expect(adapter.object3d.parent).toBe(coordinateRoot);
    adapter.updateFrame();
    expect(adapter.diagnostics.visibleChunkCount).toBe(1);
    adapter.setLayerEnabled(0, false);
    expect(adapter.diagnostics.layers[0]!.enabled).toBe(false);

    adapter.dispose();
    adapter.dispose();
    expect(adapter.object3d.parent).toBeNull();
    expect(adapter.runtime.disposed).toBe(true);
    expect(() => adapter.updateFrame()).toThrow('already disposed');
  });

  it('accepts a replacement camera adapter without changing dataset or layer config', async () => {
    const scene = new Scene();
    const cameraAdapter = {
      update: vi.fn(() => ({
        cameraPositionModel: { x: 0, y: 0, z: 0 },
        clipFromModelMatrix: identityMatrix,
        clipSpaceDepthRange: 'negative-one-to-one' as const,
      })),
    };
    const adapter = await createThreeVegetation({
      renderer: createRenderer(),
      scene,
      camera: new PerspectiveCamera(),
      cameraAdapter,
      source: new Uint8Array(),
      config: vegetationRuntimeConfig,
      preparation: createPreparation(createPreparedRuntime()),
    });

    adapter.updateFrame();
    expect(cameraAdapter.update).toHaveBeenCalledOnce();
    expect(adapter.diagnostics.visibleChunkCount).toBe(1);
    adapter.dispose();
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
  const dataset = createVegetationRuntimeDataset(createParsedFile(), vegetationRuntimeConfig);
  return {
    dataset,
    activeCells: [createVegetationActiveCellData(dataset, 0)],
    preparationMilliseconds: 12.5,
  };
}

function createParsedFile(): ParsedVegFile {
  return {
    bytes: new Uint8Array(),
    header: {
      version: 1,
      fileSize: 0,
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
    chunks: [{ gridX: 0, gridY: 0, minimumHeight: 0, maximumHeight: 0 }],
    heightData: Float64Array.of(0, 0, 0, 0),
    layers: [{
      id: 0,
      key: 'meadow-grass',
      displayName: 'Meadow grass',
      maskResolution: 2,
      activeCellCount: 4,
      maskData: Uint8Array.of(1, 1, 1, 1),
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}
