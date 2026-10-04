import type { VegetationRuntimeProfile } from '../../../runtime/VegetationPipelineSetup.js';
import { createBuiltInVegFileDatasetCreationWorker } from '../../built-in-dataset-preparation/BuiltInVegFileDatasetCreationWorker.js';
import type { WebGLGrassGroundPatchSurface } from '../../../runtime/project-integration/layer-profile-integration/grass/ground-patch-material/WebGLGrassGroundPatchSurface.js';
import { createThreeWebGLGrassLightingMaterialFactory } from '../../../runtime/project-integration/layer-profile-integration/grass/lighting-material/ThreeWebGLGrassLightingMaterialFactory.js';
import type { WebGLGrassLightingMaterialFactory } from '../../../runtime/project-integration/layer-profile-integration/grass/lighting-material/WebGLGrassLightingMaterialFactory.js';
import {
  grassLayerPreparation,
  requireGrassRuntimeLayer,
} from '../grass-layer-preparation/GrassLayerPreparation.js';
import { WebGLGrassLayerRenderer } from './WebGLGrassLayerRenderer.js';

export type WebGLGrassRuntimeProfileOptions = Readonly<{
  grassLightingMaterialFactory?: WebGLGrassLightingMaterialFactory;
  groundPatchSurface?: WebGLGrassGroundPatchSurface;
}>;

/** Creates a complete Grass profile with Worker preparation and WebGL rendering. */
export function createWebGLGrassRuntimeProfile(
  options: WebGLGrassRuntimeProfileOptions = {},
): VegetationRuntimeProfile {
  const grassLightingMaterialFactory = options.grassLightingMaterialFactory
    ?? createThreeWebGLGrassLightingMaterialFactory();
  return {
    profileType: grassLayerPreparation.profileType,
    datasetCreationWorkerFactory: createBuiltInVegFileDatasetCreationWorker,
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
