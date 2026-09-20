import type { Object3D } from 'three';

import type { VegetationRuntimeLayer } from '../runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import type { VegetationFrameState } from '../vegetation-runtime-orchestration/VegetationFrameState.js';
import type { WebGLSharedVegetationResources } from '../webgl-vegetation-resource-management/WebGLSharedVegetationResources.js';

export type WebGLVegetationLayerRendererDiagnostics = Readonly<{
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
}>;

export type WebGLVegetationLayerRendererContext = Readonly<{
  sharedResources: WebGLSharedVegetationResources;
  layer: VegetationRuntimeLayer;
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
  validateLayer?(layer: VegetationRuntimeLayer): void;
  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer;
}
