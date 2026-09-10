import { Group, type WebGLRenderer } from 'three';

import { createRuntimeChunkBoundingBoxes } from '../chunking/ChunkBoundingBoxes.js';
import { FrustumChunkVisibility } from '../chunking/FrustumChunkVisibility.js';
import type { VegetationRuntimeConfig } from '../config/types.js';
import type { VegetationRuntimeLayer } from '../dataset/types.js';
import type { VegetationActiveCellData } from '../density/types.js';
import type { VegetationFrameState } from '../frame/types.js';
import { WebGLVegetationAdapter } from '../gpu/webgl/WebGLVegetationAdapter.js';
import { SynchronousVegetationPreparation } from '../preparation/SynchronousVegetationPreparation.js';
import type {
  PreparedVegetationRuntime,
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from '../preparation/types.js';
import { WebGLGrassView } from '../rendering/webgl/WebGLGrassView.js';

export type WebGLVegetationLayerDiagnostics = Readonly<{
  layerId: number;
  key: string;
  enabled: boolean;
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
}>;

export type WebGLVegetationRuntimeDiagnostics = Readonly<{
  preparationMilliseconds: number;
  visibleChunkCount: number;
  layers: readonly WebGLVegetationLayerDiagnostics[];
}>;

export type CreateWebGLVegetationRuntimeOptions = Readonly<{
  renderer: WebGLRenderer;
  source: VegetationRuntimeSource;
  config: VegetationRuntimeConfig;
  preparation?: VegetationPreparationAdapter;
  signal?: AbortSignal;
}>;

type MutableLayerDiagnostics = {
  layerId: number;
  key: string;
  enabled: boolean;
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
};

type RuntimeLayer = Readonly<{
  datasetLayer: VegetationRuntimeLayer;
  view: WebGLGrassView;
  diagnostics: MutableLayerDiagnostics;
}>;

const synchronousPreparation = new SynchronousVegetationPreparation();

/** Owns the complete WebGL lifecycle for one prepared vegetation asset. */
export class WebGLVegetationRuntime {
  readonly object3d = new Group();
  readonly diagnostics: WebGLVegetationRuntimeDiagnostics;

  readonly #adapter: WebGLVegetationAdapter;
  readonly #visibility: FrustumChunkVisibility;
  readonly #layers: readonly RuntimeLayer[];
  readonly #mutableDiagnostics: {
    preparationMilliseconds: number;
    visibleChunkCount: number;
    layers: MutableLayerDiagnostics[];
  };
  #disposed = false;

  private constructor(
    renderer: WebGLRenderer,
    prepared: PreparedVegetationRuntime,
  ) {
    validatePreparedActiveCells(prepared);
    this.object3d.name = 'vegetation/runtime';
    const createdLayers: RuntimeLayer[] = [];
    let adapter: WebGLVegetationAdapter | undefined;
    let visibility: FrustumChunkVisibility | undefined;
    try {
      adapter = new WebGLVegetationAdapter(renderer, prepared.dataset);
      for (const datasetLayer of prepared.dataset.enabledLayers) {
        const view = new WebGLGrassView(
          adapter,
          datasetLayer.layerId,
          prepared.activeCells.find((cells) => cells.layerId === datasetLayer.layerId),
        );
        const diagnostics: MutableLayerDiagnostics = {
          layerId: datasetLayer.layerId,
          key: datasetLayer.key,
          enabled: true,
          visibleTileCount: 0,
          visibleCandidateCount: 0,
          executedCandidateCount: 0,
          frustumTestedTileCount: 0,
          frustumCulledTileCount: 0,
        };
        createdLayers.push({ datasetLayer, view, diagnostics });
        this.object3d.add(view.mesh);
      }
      visibility = new FrustumChunkVisibility(
        createRuntimeChunkBoundingBoxes(prepared.dataset),
      );
    } catch (error) {
      for (let index = createdLayers.length - 1; index >= 0; index -= 1) {
        createdLayers[index]!.view.dispose();
      }
      adapter?.dispose();
      throw error;
    }
    this.#adapter = adapter;
    this.#layers = createdLayers;
    this.#visibility = visibility;
    this.#mutableDiagnostics = {
      preparationMilliseconds: prepared.preparationMilliseconds,
      visibleChunkCount: 0,
      layers: createdLayers.map((layer) => layer.diagnostics),
    };
    this.diagnostics = this.#mutableDiagnostics;
  }

  static async create(
    options: CreateWebGLVegetationRuntimeOptions,
  ): Promise<WebGLVegetationRuntime> {
    const signal = options.signal ?? new AbortController().signal;
    const prepared = await (options.preparation ?? synchronousPreparation).prepare(
      options.source,
      options.config,
      signal,
    );
    if (signal.aborted) {
      const error = new Error('Vegetation runtime creation aborted.');
      error.name = 'AbortError';
      throw error;
    }
    return new WebGLVegetationRuntime(options.renderer, prepared);
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
      this.#adapter.updateVisibleChunks(this.#visibility.visibleChunkIndices, 0);
      this.#mutableDiagnostics.visibleChunkCount = 0;
      return;
    }
    const visibleChunkCount = this.#visibility.updateVisibleChunks(
      frameState.clipFromModelMatrix,
      frameState.clipSpaceDepthRange,
    );
    this.#adapter.updateVisibleChunks(
      this.#visibility.visibleChunkIndices,
      visibleChunkCount,
    );
    this.#mutableDiagnostics.visibleChunkCount = visibleChunkCount;
    for (const layer of this.#layers) {
      if (!layer.diagnostics.enabled) continue;
      layer.view.updateDensity(
        frameState.cameraPositionModel,
        frameState.clipFromModelMatrix,
        frameState.clipSpaceDepthRange,
      );
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
    runtimeLayer.view.mesh.visible = enabled;
    if (!enabled) clearLayerDiagnostics(runtimeLayer.diagnostics);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.object3d.clear();
    for (let index = this.#layers.length - 1; index >= 0; index -= 1) {
      this.#layers[index]!.view.dispose();
    }
    this.#adapter.dispose();
    this.#mutableDiagnostics.visibleChunkCount = 0;
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

function validatePreparedActiveCells(prepared: PreparedVegetationRuntime): void {
  const layerIds = new Set<number>();
  for (const activeCells of prepared.activeCells) {
    if (layerIds.has(activeCells.layerId)) {
      throw new Error(`Prepared active Cells contain duplicate layer ${activeCells.layerId}.`);
    }
    layerIds.add(activeCells.layerId);
  }
  for (const layer of prepared.dataset.enabledLayers) {
    if (!layerIds.has(layer.layerId)) {
      throw new Error(`Prepared active Cells are missing enabled layer ${layer.layerId}.`);
    }
  }
}

function updateLayerDiagnostics(layer: RuntimeLayer): void {
  layer.diagnostics.visibleTileCount = layer.view.visibleTileCount;
  layer.diagnostics.visibleCandidateCount = layer.view.visibleCandidateCount;
  layer.diagnostics.executedCandidateCount = layer.view.executedCandidateCount;
  layer.diagnostics.frustumTestedTileCount = layer.view.tileDensity.frustumTestedTileCount;
  layer.diagnostics.frustumCulledTileCount = layer.view.tileDensity.frustumCulledTileCount;
}

function clearLayerDiagnostics(diagnostics: MutableLayerDiagnostics): void {
  diagnostics.visibleTileCount = 0;
  diagnostics.visibleCandidateCount = 0;
  diagnostics.executedCandidateCount = 0;
  diagnostics.frustumTestedTileCount = 0;
  diagnostics.frustumCulledTileCount = 0;
}
