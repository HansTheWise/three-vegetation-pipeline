import type { DataTexture } from 'three';

import type { VegetationRuntimeDataset } from '../../../../dataset/types.js';
import type { GrassRuntimeLayer } from '../../GrassLayerPreparation.js';
import type { GrassGroundPatchField } from '../../patches/types.js';

export type WebGLGrassGroundPatchSurfaceContext = Readonly<{
  dataset: VegetationRuntimeDataset;
  layer: GrassRuntimeLayer;
  field: GrassGroundPatchField;
  texture: DataTexture;
}>;

/** Optional Grass feature that projects its patch field onto consumer surfaces. */
export interface WebGLGrassGroundPatchSurface {
  install(context: WebGLGrassGroundPatchSurfaceContext): () => void;
}
