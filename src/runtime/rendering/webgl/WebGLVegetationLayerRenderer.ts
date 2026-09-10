import type { Object3D } from 'three';

import type { VegetationRuntimeLayer } from '../../dataset/types.js';
import type { VegetationActiveCellData } from '../../density/types.js';
import type { VegetationFrameState } from '../../frame/types.js';
import type { WebGLVegetationAdapter } from '../../gpu/webgl/WebGLVegetationAdapter.js';

export type WebGLVegetationLayerRendererDiagnostics = Readonly<{
  visibleTileCount: number;
  visibleCandidateCount: number;
  executedCandidateCount: number;
  frustumTestedTileCount: number;
  frustumCulledTileCount: number;
}>;

export type WebGLVegetationLayerRendererContext = Readonly<{
  adapter: WebGLVegetationAdapter;
  layer: VegetationRuntimeLayer;
  activeCells: VegetationActiveCellData;
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
  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer;
}
