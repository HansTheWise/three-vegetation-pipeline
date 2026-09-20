import type { DataTexture } from 'three';

import type { VegetationRuntimeDataset } from '../../../runtime/runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import type { GrassRuntimeLayer } from '../grass-layer-preparation/GrassLayerPreparation.js';
import type { GrassGroundPatchField } from '../grass-ground-patch-generation/GrassGroundPatchTypes.js';

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
