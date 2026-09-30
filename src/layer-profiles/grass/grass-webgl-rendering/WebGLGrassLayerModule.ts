import type { WebGLVegetationLayerModule } from '../../../runtime/vegetation-layer-management/WebGLVegetationLayerManager.js';
import type { WebGLGrassGroundPatchSurface } from '../../../runtime/project-integration/layer-profile-integration/grass/ground-patch-material/WebGLGrassGroundPatchSurface.js';
import { createThreeWebGLGrassLightingMaterialFactory } from '../../../runtime/project-integration/layer-profile-integration/grass/lighting-material/ThreeWebGLGrassLightingMaterialFactory.js';
import type { WebGLGrassLightingMaterialFactory } from '../../../runtime/project-integration/layer-profile-integration/grass/lighting-material/WebGLGrassLightingMaterialFactory.js';
import {
  grassLayerPreparation,
  requireGrassRuntimeLayer,
} from '../grass-layer-preparation/GrassLayerPreparation.js';
import { WebGLGrassLayerRenderer } from './WebGLGrassLayerRenderer.js';

export type WebGLGrassLayerModuleOptions = Readonly<{
  grassLightingMaterialFactory?: WebGLGrassLightingMaterialFactory;
  groundPatchSurface?: WebGLGrassGroundPatchSurface;
}>;

/** Creates the complete opt-in Grass preparation and WebGL rendering module. */
export function createWebGLGrassLayerModule(
  options: WebGLGrassLayerModuleOptions = {},
): WebGLVegetationLayerModule {
  const grassLightingMaterialFactory = options.grassLightingMaterialFactory
    ?? createThreeWebGLGrassLightingMaterialFactory();
  return {
    ...grassLayerPreparation,
    validateLayer: requireGrassRuntimeLayer,
    create: ({
      renderer,
      vegetationDataset,
      vegetationDatasetTextures,
      visibleStoredChunkTexture,
      layer,
    }) => new WebGLGrassLayerRenderer({
      renderer,
      vegetationDataset,
      vegetationDatasetTextures,
      visibleStoredChunkTexture,
      layer: requireGrassRuntimeLayer(layer),
      grassLightingMaterialFactory,
      ...(options.groundPatchSurface
        ? { groundPatchSurface: options.groundPatchSurface }
        : {}),
    }),
  };
}
