import { type Object3D, type WebGLRenderer } from 'three';

import type { ModelPosition } from '../layer-profiles/reusable-profile-features/render-tile-density-selection/DensitySelectionTypes.js';
import type { VegetationRuntimeConfig } from './dataset-preparation/configuration/VegetationRuntimeConfig.js';
import type {
  VegFileDatasetCreationAdapter,
  VegetationRuntimeSource,
} from './dataset-preparation/VegFileDatasetCreationContracts.js';
import { ChunkVisibilityManager } from './chunk-visibility-management/ChunkVisibilityManager.js';
import type {
  ClipSpaceDepthRange,
  Matrix4Elements,
} from './chunk-visibility-management/frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';
import {
  createValidatedWebGLVegetationLayerRendererRegistry,
  WebGLVegetationLayerManager,
  type VegetationLayerDiagnostics,
  type WebGLVegetationLayerRendererFactory,
} from './vegetation-layer-management/WebGLVegetationLayerManager.js';

/**
 * Root manager for one vegetation runtime.
 *
 * Initialization passes data through four responsibility boundaries:
 *
 * 1. The required `VegFileDatasetCreationAdapter` converts VEGFILE bytes and
 *    runtime configuration into a renderer-independent dataset result.
 * 2. Runtime-profile renderer factories are validated before any GPU
 *    resource is allocated.
 * 3. `ChunkVisibilityManager` creates the stored-chunk bounds and owns the
 *    mutable visible-chunk texture.
 * 4. `WebGLVegetationLayerManager` owns immutable dataset textures and creates
 *    the configured layer renderers from the validated registry.
 *
 * During a frame, shared chunk visibility is published before any layer
 * renderer is updated. This manager owns the completed child-manager lifetime.
 */
export class VegetationRuntimeManager {
  readonly object3d: Object3D;
  readonly diagnostics: VegetationRuntimeDiagnostics;

  readonly #vegetationLayerManager: WebGLVegetationLayerManager;
  readonly #chunkVisibilityManager: ChunkVisibilityManager | undefined;
  readonly #mutableDiagnostics: {
    datasetCreationMilliseconds: number;
    visibleStoredChunkCount: number;
    layers: readonly VegetationLayerDiagnostics[];
  };
  #destroyed = false;

  /** Creates the child managers in the same order in which data reaches them. */
  static async create(
    options: CreateVegetationRuntimeManagerOptions,
  ): Promise<VegetationRuntimeManager> {
    // Stage 1: VEGFILE bytes and runtime configuration -> prepared runtime dataset.
    options.cancellationSignal?.throwIfAborted();

    const vegetationDatasetCreationResult =
      await options.datasetCreationAdapter.createVegetationDataset(
        options.vegFileBytes,
        options.vegetationRuntimeConfig,
        options.cancellationSignal,
      );
    options.cancellationSignal?.throwIfAborted();

    // Stage 2: prepared layers + renderer factories -> validated renderer registry.
    const vegetationDataset = vegetationDatasetCreationResult.dataset;
    const rendererRegistry = createValidatedWebGLVegetationLayerRendererRegistry(
      vegetationDataset,
      options.layerRendererFactories,
    );

    // Stage 3: prepared dataset -> stored-chunk evaluator + visible-chunk texture.
    const chunkVisibilityManager = vegetationDataset.preparedLayers.length > 0
      ? new ChunkVisibilityManager({
        renderer: options.renderer,
        vegetationDataset,
      })
      : undefined;

    // Stage 4: validated registry + explicit textures -> initialized layer renderers.
    try {
      const vegetationLayerManager = new WebGLVegetationLayerManager({
        renderer: options.renderer,
        vegetationDataset,
        rendererRegistry,
        visibleStoredChunkTexture:
          chunkVisibilityManager?.visibleStoredChunkTexture,
      });

      return new VegetationRuntimeManager(
        vegetationDatasetCreationResult.datasetCreationMilliseconds,
        vegetationLayerManager,
        chunkVisibilityManager,
      );
    } catch (error) {
      chunkVisibilityManager?.dispose();
      throw error;
    }
  }

  private constructor(
    datasetCreationMilliseconds: number,
    vegetationLayerManager: WebGLVegetationLayerManager,
    chunkVisibilityManager: ChunkVisibilityManager | undefined,
  ) {
    this.#vegetationLayerManager = vegetationLayerManager;
    this.#chunkVisibilityManager = chunkVisibilityManager;
    this.object3d = vegetationLayerManager.object3d;
    this.object3d.name = 'vegetation/runtime';
    this.#mutableDiagnostics = {
      datasetCreationMilliseconds,
      visibleStoredChunkCount: 0,
      layers: vegetationLayerManager.diagnostics,
    };
    this.diagnostics = this.#mutableDiagnostics;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  /** Publishes shared chunk visibility before updating the prepared layers. */
  updateFrame(frameState: VegetationFrameState): void {
    this.#assertActive();
    const visibleStoredChunkCount = this.#chunkVisibilityManager
      ? this.#chunkVisibilityManager.updateVisibleStoredChunks(frameState)
      : 0;
    this.#mutableDiagnostics.visibleStoredChunkCount = visibleStoredChunkCount;
    this.#vegetationLayerManager.updateFrame(frameState);
  }

  /** Releases both child managers and the WebGL resources each one owns. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#vegetationLayerManager.dispose();
    this.#chunkVisibilityManager?.dispose();
    this.#mutableDiagnostics.visibleStoredChunkCount = 0;
  }

  #assertActive(): void {
    if (this.#destroyed) throw new Error('Vegetation runtime is already destroyed.');
  }
}

export function createVegetationRuntimeManager(
  options: CreateVegetationRuntimeManagerOptions,
): Promise<VegetationRuntimeManager> {
  return VegetationRuntimeManager.create(options);
}



// ---- Types -----

export type CreateVegetationRuntimeManagerOptions = Readonly<{
  renderer: WebGLRenderer;
  vegFileBytes: VegetationRuntimeSource;
  vegetationRuntimeConfig: VegetationRuntimeConfig;
  datasetCreationAdapter: VegFileDatasetCreationAdapter;
  layerRendererFactories: readonly WebGLVegetationLayerRendererFactory[];
  cancellationSignal?: AbortSignal;
}>;

export type VegetationRuntimeDiagnostics = Readonly<{
  datasetCreationMilliseconds: number;
  visibleStoredChunkCount: number;
  layers: readonly VegetationLayerDiagnostics[];
}>;

/** Renderer-neutral camera data passed through the runtime once per frame. */
export type VegetationFrameState = Readonly<{
  cameraPositionModel: ModelPosition;
  clipFromModelMatrix: Matrix4Elements;
  clipSpaceDepthRange: ClipSpaceDepthRange;
}>;
