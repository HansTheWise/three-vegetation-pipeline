import { createThreeWebGLVegetationLightingMaterialFactory } from '../../../runtime/threejs-runtime-integration/ThreeWebGLVegetationLightingMaterialFactory.js';
import type { WebGLVegetationLayerModule } from '../../../runtime/vegetation-layer-rendering-contracts/WebGLVegetationLayerModule.js';
import type { WebGLVegetationLightingMaterialFactory } from '../../../runtime/vegetation-layer-rendering-contracts/WebGLVegetationLightingMaterialFactory.js';
import {
  grassLayerPreparation,
  requireGrassRuntimeLayer,
} from '../grass-layer-preparation/GrassLayerPreparation.js';
import type { WebGLGrassGroundPatchSurface } from './WebGLGrassGroundPatchSurface.js';
import { WebGLGrassLayerRenderer } from './WebGLGrassLayerRenderer.js';

export type WebGLGrassLayerModuleOptions = Readonly<{
  lightingMaterialFactory?: WebGLVegetationLightingMaterialFactory;
  groundPatchSurface?: WebGLGrassGroundPatchSurface;
}>;

/** Creates the complete opt-in Grass preparation and WebGL rendering module. */
export function createWebGLGrassLayerModule(
  options: WebGLGrassLayerModuleOptions = {},
): WebGLVegetationLayerModule {
  const lightingMaterialFactory = options.lightingMaterialFactory
    ?? createThreeWebGLVegetationLightingMaterialFactory();
  return {
    ...grassLayerPreparation,
    validateLayer: requireGrassRuntimeLayer,
    create: ({ sharedResources, layer }) => new WebGLGrassLayerRenderer({
      sharedResources,
      layer: requireGrassRuntimeLayer(layer),
      lightingMaterialFactory,
      ...(options.groundPatchSurface
        ? { groundPatchSurface: options.groundPatchSurface }
        : {}),
    }),
  };
}
