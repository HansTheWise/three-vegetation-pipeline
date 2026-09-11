import type { VegetationLayerPreparation } from '../../profiles/VegetationLayerPreparation.js';
import type { WebGLVegetationLayerRendererFactory } from './WebGLVegetationLayerRenderer.js';

/** Complete executable contract for one WebGL vegetation render profile. */
export interface WebGLVegetationLayerModule
  extends VegetationLayerPreparation, WebGLVegetationLayerRendererFactory {}
