import { Group, type WebGLRenderer } from 'three';

import { createRuntimeStoredChunkCullingBounds } from '../stored-chunk-visibility/stored-chunk-culling-bounds/StoredChunkCullingBounds.js';
import { FrustumStoredChunkVisibility } from '../stored-chunk-visibility/frustum-visibility-evaluation/FrustumStoredChunkVisibility.js';
import type { VegetationRuntimeConfig } from '../runtime-dataset-preparation/configuration/VegetationRuntimeConfig.js';
import type { VegetationRuntimeLayer } from '../runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import type { VegetationFrameState } from './VegetationFrameState.js';
import { WebGLSharedVegetationResources } from '../webgl-vegetation-resource-management/WebGLSharedVegetationResources.js';
import { SynchronousVegetationPreparation } from '../runtime-dataset-preparation/worker-preparation/SynchronousVegetationPreparation.js';
import type {
  PreparedVegetationRuntime,
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from '../runtime-dataset-preparation/worker-preparation/VegetationPreparationTypes.js';
import type { WebGLVegetationLayerModule } from '../vegetation-layer-rendering-contracts/WebGLVegetationLayerModule.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererFactory,
} from '../vegetation-layer-rendering-contracts/WebGLVegetationLayerRenderer.js';

export type WebGLVegetationLayerDiagnostics = Readonly<{
  layerId: number;
  key: string;
  profileType: string;
  enabled: boolean;
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
}>;

export type WebGLVegetationRuntimeDiagnostics = Readonly<{
  preparationMilliseconds: number;
  visibleStoredChunkCount: number;
  layers: readonly WebGLVegetationLayerDiagnostics[];
}>;

export type CreateWebGLVegetationRuntimeOptions = Readonly<{
  renderer: WebGLRenderer;
  source: VegetationRuntimeSource;
  config: VegetationRuntimeConfig;
  preparation?: VegetationPreparationAdapter;
  layerModules: readonly WebGLVegetationLayerModule[];
  signal?: AbortSignal;
}>;

type MutableLayerDiagnostics = {
  layerId: number;
  key: string;
  profileType: string;
  enabled: boolean;
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
};

type RuntimeLayer = Readonly<{
  datasetLayer: VegetationRuntimeLayer;
  renderer: WebGLVegetationLayerRenderer;
  diagnostics: MutableLayerDiagnostics;
}>;

/** Owns the complete WebGL lifecycle for one prepared vegetation asset. */
export class WebGLVegetationRuntime {
  readonly object3d = new Group();
  readonly diagnostics: WebGLVegetationRuntimeDiagnostics;

  readonly #sharedResources: WebGLSharedVegetationResources | undefined;
  readonly #storedChunkVisibility: FrustumStoredChunkVisibility | undefined;
  readonly #layers: readonly RuntimeLayer[];
  readonly #mutableDiagnostics: {
    preparationMilliseconds: number;
    visibleStoredChunkCount: number;
    layers: MutableLayerDiagnostics[];
  };
  #disposed = false;

  private constructor(
    renderer: WebGLRenderer,
    prepared: PreparedVegetationRuntime,
    rendererFactories: ReadonlyMap<string, WebGLVegetationLayerRendererFactory>,
  ) {
    validateLayerRenderers(prepared, rendererFactories);
    this.object3d.name = 'vegetation/runtime';
    const createdLayers: RuntimeLayer[] = [];
    let sharedResources: WebGLSharedVegetationResources | undefined;
    let storedChunkVisibility: FrustumStoredChunkVisibility | undefined;
    try {
      if (prepared.dataset.preparedLayers.length > 0) {
        sharedResources = new WebGLSharedVegetationResources(renderer, prepared.dataset);
        for (const datasetLayer of prepared.dataset.preparedLayers) {
          const layerRenderer = rendererFactories
            .get(datasetLayer.config.renderProfile.type)!
            .create({ sharedResources, layer: datasetLayer });
          const diagnostics: MutableLayerDiagnostics = {
            layerId: datasetLayer.layerId,
            key: datasetLayer.key,
            profileType: datasetLayer.config.renderProfile.type,
            enabled: true,
            visibleTileCount: 0,
            visibleCandidateCount: 0,
            executedCandidateCount: 0,
            frustumTestedTileCount: 0,
            frustumCulledTileCount: 0,
          };
          createdLayers.push({ datasetLayer, renderer: layerRenderer, diagnostics });
          this.object3d.add(layerRenderer.object3d);
        }
        storedChunkVisibility = new FrustumStoredChunkVisibility(
          createRuntimeStoredChunkCullingBounds(prepared.dataset),
        );
      }
    } catch (error) {
      for (let index = createdLayers.length - 1; index >= 0; index -= 1) {
        createdLayers[index]!.renderer.dispose();
      }
      sharedResources?.dispose();
      throw error;
    }
    this.#sharedResources = sharedResources;
    this.#layers = createdLayers;
    this.#storedChunkVisibility = storedChunkVisibility;
    this.#mutableDiagnostics = {
      preparationMilliseconds: prepared.preparationMilliseconds,
      visibleStoredChunkCount: 0,
      layers: createdLayers.map((layer) => layer.diagnostics),
    };
    this.diagnostics = this.#mutableDiagnostics;
  }

  static async create(
    options: CreateWebGLVegetationRuntimeOptions,
  ): Promise<WebGLVegetationRuntime> {
    const signal = options.signal ?? new AbortController().signal;
    const preparation = options.preparation
      ?? new SynchronousVegetationPreparation(options.layerModules);
    const prepared = await preparation.prepare(
      options.source,
      options.config,
      signal,
    );
    if (signal.aborted) {
      const error = new Error('Vegetation runtime creation aborted.');
      error.name = 'AbortError';
      throw error;
    }
    return new WebGLVegetationRuntime(
      options.renderer,
      prepared,
      createLayerRendererRegistry(options.layerModules),
    );
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  updateFrame(frameState: VegetationFrameState): void {
    this.#assertActive();
    let hasActiveLayer = false;
    for (const layer of this.#layers) {
      if (layer.diagnostics.enabled) {
        hasActiveLayer = true;
        break;
      }
    }
    if (!hasActiveLayer) {
      if (this.#sharedResources && this.#storedChunkVisibility) {
        this.#sharedResources.visibleStoredChunkTexture.update(
          this.#storedChunkVisibility.visibleStoredChunkIndices,
          0,
        );
      }
      this.#mutableDiagnostics.visibleStoredChunkCount = 0;
      return;
    }
    if (!this.#sharedResources || !this.#storedChunkVisibility) {
      throw new Error('Active vegetation layers require initialized shared resources.');
    }
    const visibleStoredChunkCount = this.#storedChunkVisibility.updateVisibleStoredChunks(
      frameState.clipFromModelMatrix,
      frameState.clipSpaceDepthRange,
    );
    this.#sharedResources.visibleStoredChunkTexture.update(
      this.#storedChunkVisibility.visibleStoredChunkIndices,
      visibleStoredChunkCount,
    );
    this.#mutableDiagnostics.visibleStoredChunkCount = visibleStoredChunkCount;
    for (const layer of this.#layers) {
      if (!layer.diagnostics.enabled) continue;
      layer.renderer.updateFrame(frameState);
      updateLayerDiagnostics(layer);
    }
  }

  /** Toggles a layer that was enabled when the Runtime was created. */
  setLayerEnabled(layer: number | string, enabled: boolean): void {
    this.#assertActive();
    const runtimeLayer = this.#layers.find((candidate) => (
      typeof layer === 'number'
        ? candidate.datasetLayer.layerId === layer
        : candidate.datasetLayer.key === layer
    ));
    if (!runtimeLayer) {
      throw new Error(`Initialized vegetation layer ${String(layer)} does not exist.`);
    }
    runtimeLayer.diagnostics.enabled = enabled;
    runtimeLayer.renderer.object3d.visible = enabled;
    if (!enabled) clearLayerDiagnostics(runtimeLayer.diagnostics);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.object3d.clear();
    for (let index = this.#layers.length - 1; index >= 0; index -= 1) {
      this.#layers[index]!.renderer.dispose();
    }
    this.#sharedResources?.dispose();
    this.#mutableDiagnostics.visibleStoredChunkCount = 0;
    this.#layers.forEach((layer) => {
      layer.diagnostics.enabled = false;
      clearLayerDiagnostics(layer.diagnostics);
    });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Vegetation runtime is already disposed.');
  }
}

export function createWebGLVegetationRuntime(
  options: CreateWebGLVegetationRuntimeOptions,
): Promise<WebGLVegetationRuntime> {
  return WebGLVegetationRuntime.create(options);
}

function updateLayerDiagnostics(layer: RuntimeLayer): void {
  const rendererDiagnostics = layer.renderer.diagnostics;
  layer.diagnostics.visibleTileCount = rendererDiagnostics.visibleTileCount;
  layer.diagnostics.visibleCandidateCount = rendererDiagnostics.visibleCandidateCount;
  layer.diagnostics.executedCandidateCount = rendererDiagnostics.executedCandidateCount;
  layer.diagnostics.frustumTestedTileCount = rendererDiagnostics.frustumTestedTileCount;
  layer.diagnostics.frustumCulledTileCount = rendererDiagnostics.frustumCulledTileCount;
}

function clearLayerDiagnostics(diagnostics: MutableLayerDiagnostics): void {
  diagnostics.visibleTileCount = 0;
  diagnostics.visibleCandidateCount = 0;
  diagnostics.executedCandidateCount = 0;
  diagnostics.frustumTestedTileCount = 0;
  diagnostics.frustumCulledTileCount = 0;
}

function createLayerRendererRegistry(
  modules: readonly WebGLVegetationLayerModule[],
): ReadonlyMap<string, WebGLVegetationLayerRendererFactory> {
  const registry = new Map<string, WebGLVegetationLayerRendererFactory>();
  for (const module of modules) {
    if (module.profileType.length === 0) {
      throw new Error('WebGL vegetation layer renderer profileType must not be empty.');
    }
    if (registry.has(module.profileType)) {
      throw new Error(
        `Duplicate WebGL vegetation layer module for profile "${module.profileType}".`,
      );
    }
    registry.set(module.profileType, module);
  }
  return registry;
}

function validateLayerRenderers(
  prepared: PreparedVegetationRuntime,
  rendererFactories: ReadonlyMap<string, WebGLVegetationLayerRendererFactory>,
): void {
  for (const layer of prepared.dataset.preparedLayers) {
    const profileType = layer.config.renderProfile.type;
    const factory = rendererFactories.get(profileType);
    if (!factory) {
      throw new Error(
        `No WebGL vegetation layer renderer is registered for profile "${profileType}".`,
      );
    }
    factory.validateLayer?.(layer);
  }
}
