import type { VegetationLayerPreparation } from '../runtime-dataset-preparation/layer-profile-preparation/VegetationLayerPreparation.js';
import type { WebGLVegetationLayerRendererFactory } from './WebGLVegetationLayerRenderer.js';

/** Complete executable contract for one WebGL vegetation render profile. */
export interface WebGLVegetationLayerModule
  extends VegetationLayerPreparation, WebGLVegetationLayerRendererFactory {}
