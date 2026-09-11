export type {
  GrassRuntimeLayerConfig,
  VegetationRenderBounds,
  VegetationRuntimeConfig,
  VegetationRuntimeLayerConfig,
} from './runtime/config/types.js';
export type {
  VegetationPreparationAdapter,
  VegetationPreparationWorkerRequest,
  VegetationPreparationWorkerResponse,
  VegetationRuntimeSource,
} from './runtime/preparation/types.js';
export { WorkerVegetationPreparation } from './runtime/preparation/WorkerVegetationPreparation.js';
export {
  installVegetationPreparationWorker,
  type VegetationPreparationWorkerScope,
} from './runtime/preparation/VegetationPreparationWorker.js';
export {
  ThreeVegetationSceneAdapter,
  createThreeVegetation,
  type CreateThreeVegetationOptions,
} from './runtime/adapters/three/ThreeVegetationSceneAdapter.js';
export {
  ThreeVegetationSystem,
  createThreeVegetationSystem,
  type CreateThreeVegetationInstanceOptions,
  type CreateThreeVegetationSystemOptions,
} from './runtime/adapters/three/ThreeVegetationSystem.js';
export type { ThreeVegetationCameraAdapter } from './runtime/adapters/three/ThreeCameraAdapter.js';
export type { WebGLVegetationLayerModule } from './runtime/rendering/webgl/WebGLVegetationLayerModule.js';
export {
  createWebGLGrassLayerModule,
  type WebGLGrassLayerRendererFactoryOptions,
} from './runtime/rendering/webgl/WebGLGrassLayerRendererFactory.js';
export {
  createGrassLayerConfig,
  grassPreset,
  type GrassLayerPresetOptions,
} from './runtime/profiles/grass/GrassLayerPreset.js';
