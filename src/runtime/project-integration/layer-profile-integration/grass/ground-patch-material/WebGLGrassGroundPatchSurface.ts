import type { DataTexture } from 'three';

import type { GrassRuntimeLayer } from '../../../../../layer-profiles/grass/grass-layer-preparation/GrassLayerPreparation.js';
import type { GrassGroundPatchField } from '../../../../../layer-profiles/grass/grass-ground-patch-generation/GrassGroundPatchTypes.js';
import type { PreparedVegetationDataset } from '../../../../dataset-preparation/dataset-construction/PreparedVegetationDataset.js';

export type WebGLGrassGroundPatchSurfaceContext = Readonly<{
  dataset: PreparedVegetationDataset;
  layer: GrassRuntimeLayer;
  field: GrassGroundPatchField;
  texture: DataTexture;
}>;

/** Optional Grass feature that projects its patch field onto consumer surfaces. */
export interface WebGLGrassGroundPatchSurface {
  install(context: WebGLGrassGroundPatchSurfaceContext): () => void;
}
