import { Group, type Object3D, type WebGLRenderer } from 'three';

import type { VegetationLayerId } from '../../shared/vegfile-format/VegetationFileTypes.js';
import type {
  PreparedVegetationDataset,
  VegetationLayer,
} from '../dataset-preparation/dataset-construction/PreparedVegetationDataset.js';
import type { VegetationLayerPreparation } from '../dataset-preparation/layer-profile-preparation/VegetationLayerPreparation.js';
import type { WebGLVisibleStoredChunkTexture } from '../chunk-visibility-management/WebGLVisibleStoredChunkTexture.js';
import type { VegetationFrameState } from '../VegetationRuntimeManager.js';
import { WebGLVegetationDatasetTextures } from './WebGLVegetationDatasetTextures.js';

/** Creates, updates, and disposes all prepared WebGL vegetation layers. */
export class WebGLVegetationLayerManager {
  readonly object3d = new Group();
  readonly diagnostics: readonly VegetationLayerDiagnostics[];

  readonly #vegetationDatasetTextures: WebGLVegetationDatasetTextures | undefined;
  readonly #layers: readonly ManagedLayer[];

  constructor(parameters: CreateWebGLVegetationLayerManagerParameters) {
    const preparedLayers = parameters.vegetationDataset.preparedLayers;
    const visibleStoredChunkTexture = parameters.visibleStoredChunkTexture;

    const createdLayers: ManagedLayer[] = [];
    let vegetationDatasetTextures: WebGLVegetationDatasetTextures | undefined;
    try {
      if (preparedLayers.length > 0) {
        if (!visibleStoredChunkTexture) {
          throw new Error('Prepared vegetation layers require a visible stored-chunk texture.');
        }
        vegetationDatasetTextures = new WebGLVegetationDatasetTextures(
          parameters.renderer,
          parameters.vegetationDataset,
        );
        for (const datasetLayer of preparedLayers) {
          const profileType = datasetLayer.config.renderProfile.type;
          const rendererFactory = parameters.rendererRegistry.get(profileType);
          if (!rendererFactory) {
            throw new Error(
              `Validated renderer registry has no factory for profile "${profileType}".`,
            );
          }
          const layerRenderer = rendererFactory.create({
            renderer: parameters.renderer,
            vegetationDataset: parameters.vegetationDataset,
            vegetationDatasetTextures,
            visibleStoredChunkTexture,
            layer: datasetLayer,
          });
          const diagnostics = createLayerDiagnostics(datasetLayer);
          createdLayers.push({ renderer: layerRenderer, diagnostics });
          this.object3d.add(layerRenderer.object3d);
        }
      }
    } catch (error) {
      disposeManagedLayers(createdLayers);
      vegetationDatasetTextures?.dispose();
      throw error;
    }

    this.#vegetationDatasetTextures = vegetationDatasetTextures;
    this.#layers = createdLayers;
    this.diagnostics = createdLayers.map((layer) => layer.diagnostics);
  }

  updateFrame(frameState: VegetationFrameState): void {
    for (const layer of this.#layers) {
      layer.renderer.updateFrame(frameState);
      updateLayerDiagnostics(layer);
    }
  }

  dispose(): void {
    this.object3d.clear();
    disposeManagedLayers(this.#layers);
    this.#vegetationDatasetTextures?.dispose();
  }
}

/** Validates every configured layer before any WebGL resource is allocated. */
export function createValidatedWebGLVegetationLayerRendererRegistry(
  vegetationDataset: PreparedVegetationDataset,
  modules: readonly WebGLVegetationLayerModule[],
): WebGLVegetationLayerRendererRegistry {
  const rendererRegistry = createLayerRendererRegistry(modules);
  validateLayerRenderers(vegetationDataset, rendererRegistry);
  return rendererRegistry;
}

function createLayerDiagnostics(
  datasetLayer: VegetationLayer,
): MutableLayerDiagnostics {
  return {
    vegetationLayerId: datasetLayer.vegetationLayerId,
    vegetationLayerKey: datasetLayer.vegetationLayerKey,
    profileType: datasetLayer.config.renderProfile.type,
    visibleTileCount: 0,
    visibleCandidateCount: 0,
    executedCandidateCount: 0,
    frustumTestedTileCount: 0,
    frustumCulledTileCount: 0,
  };
}

function updateLayerDiagnostics(layer: ManagedLayer): void {
  const rendererDiagnostics = layer.renderer.diagnostics;
  layer.diagnostics.visibleTileCount = rendererDiagnostics.visibleTileCount;
  layer.diagnostics.visibleCandidateCount = rendererDiagnostics.visibleCandidateCount;
  layer.diagnostics.executedCandidateCount = rendererDiagnostics.executedCandidateCount;
  layer.diagnostics.frustumTestedTileCount = rendererDiagnostics.frustumTestedTileCount;
  layer.diagnostics.frustumCulledTileCount = rendererDiagnostics.frustumCulledTileCount;
}

function disposeManagedLayers(layers: readonly ManagedLayer[]): void {
  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    layers[layerIndex]!.renderer.dispose();
  }
}

function createLayerRendererRegistry(
  modules: readonly WebGLVegetationLayerModule[],
): WebGLVegetationLayerRendererRegistry {
  const rendererRegistry = new Map<string, WebGLVegetationLayerRendererFactory>();
  for (const module of modules) {
    if (module.profileType.length === 0) {
      throw new Error('WebGL vegetation layer renderer profileType must not be empty.');
    }
    if (rendererRegistry.has(module.profileType)) {
      throw new Error(
        `Duplicate WebGL vegetation layer module for profile "${module.profileType}".`,
      );
    }
    rendererRegistry.set(module.profileType, module);
  }
  return rendererRegistry;
}

function validateLayerRenderers(
  vegetationDataset: PreparedVegetationDataset,
  rendererRegistry: WebGLVegetationLayerRendererRegistry,
): void {
  for (const layer of vegetationDataset.preparedLayers) {
    const profileType = layer.config.renderProfile.type;
    const factory = rendererRegistry.get(profileType);
    if (!factory) {
      throw new Error(
        `No WebGL vegetation layer renderer is registered for profile "${profileType}".`,
      );
    }
    factory.validateLayer?.(layer);
  }
}

// ---- Types -----

export type VegetationLayerDiagnostics = Readonly<{
  vegetationLayerId: VegetationLayerId;
  vegetationLayerKey: string;
  profileType: string;
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
}>;

export type CreateWebGLVegetationLayerManagerParameters = Readonly<{
  renderer: WebGLRenderer;
  vegetationDataset: PreparedVegetationDataset;
  rendererRegistry: WebGLVegetationLayerRendererRegistry;
  visibleStoredChunkTexture: WebGLVisibleStoredChunkTexture | undefined;
}>;

type MutableLayerDiagnostics = {
  vegetationLayerId: VegetationLayerId;
  vegetationLayerKey: string;
  profileType: string;
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
};

type ManagedLayer = Readonly<{
  renderer: WebGLVegetationLayerRenderer;
  diagnostics: MutableLayerDiagnostics;
}>;

export type WebGLVegetationLayerRendererRegistry = ReadonlyMap<
  string,
  WebGLVegetationLayerRendererFactory
>;

/** Complete executable contract for one WebGL vegetation render profile. */
export interface WebGLVegetationLayerModule
  extends VegetationLayerPreparation, WebGLVegetationLayerRendererFactory {}

export type WebGLVegetationLayerRendererDiagnostics = Readonly<{
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
}>;

export type WebGLVegetationLayerRendererContext = Readonly<{
  renderer: WebGLRenderer;
  vegetationDataset: PreparedVegetationDataset;
  vegetationDatasetTextures: WebGLVegetationDatasetTextures;
  visibleStoredChunkTexture: WebGLVisibleStoredChunkTexture;
  layer: VegetationLayer;
}>;

/** Render-profile module attached to one prepared vegetation layer. */
export interface WebGLVegetationLayerRenderer {
  readonly object3d: Object3D;
  readonly diagnostics: WebGLVegetationLayerRendererDiagnostics;
  updateFrame(frameState: VegetationFrameState): void;
  dispose(): void;
}

/** Creates renderers for exactly one renderProfile.type. */
export interface WebGLVegetationLayerRendererFactory {
  readonly profileType: string;
  validateLayer?(layer: VegetationLayer): void;
  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer;
}
