import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

import type { VegetationRuntimeConfig } from '../../dataset-preparation/configuration/VegetationRuntimeConfig.js';
import type {
  VegFileDatasetCreationAdapter,
  VegetationRuntimeSource,
} from '../../dataset-preparation/VegFileDatasetCreationContracts.js';
import type { WebGLVegetationLayerModule } from '../../vegetation-layer-management/WebGLVegetationLayerManager.js';
import {
  createVegetationRuntimeManager,
  type VegetationRuntimeDiagnostics,
  type VegetationRuntimeManager,
} from '../../VegetationRuntimeManager.js';
import {
  ThreeCameraFrameStateAdapter,
  type ThreeVegetationFrameStateProvider,
} from './ThreeCameraFrameStateAdapter.js';

export type CreateThreeVegetationSceneBindingOptions = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  vegetationParent?: Object3D;
  vegFileBytes: VegetationRuntimeSource;
  vegetationRuntimeConfig: VegetationRuntimeConfig;
  layerModules: readonly WebGLVegetationLayerModule[];
  datasetCreationAdapter: VegFileDatasetCreationAdapter;
  frameStateProvider?: ThreeVegetationFrameStateProvider;
  cancellationSignal?: AbortSignal;
}>;

/** Binds one WebGL vegetation runtime to a Three.js scene and camera lifecycle. */
export class ThreeVegetationSceneBinding {
  readonly runtime: VegetationRuntimeManager;
  readonly frameStateProvider: ThreeVegetationFrameStateProvider;
  readonly object3d: Object3D;
  #destroyed = false;

  constructor(
    runtime: VegetationRuntimeManager,
    scene: Scene,
    camera: Camera,
    vegetationParent: Object3D = scene,
    frameStateProvider?: ThreeVegetationFrameStateProvider,
  ) {
    this.runtime = runtime;
    this.object3d = runtime.object3d;
    vegetationParent.add(this.object3d);
    this.frameStateProvider = frameStateProvider
      ?? new ThreeCameraFrameStateAdapter(camera, this.object3d);
  }

  get diagnostics(): VegetationRuntimeDiagnostics {
    return this.runtime.diagnostics;
  }

  updateFrame(camera?: Camera): void {
    this.#assertActive();
    this.runtime.updateFrame(this.frameStateProvider.updateFrameState(camera));
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.object3d.removeFromParent();
    this.runtime.destroy();
  }

  #assertActive(): void {
    if (this.#destroyed) {
      throw new Error('Three vegetation scene binding is already destroyed.');
    }
  }
}

export async function createThreeVegetationSceneBinding(
  options: CreateThreeVegetationSceneBindingOptions,
): Promise<ThreeVegetationSceneBinding> {
  const runtime = await createVegetationRuntimeManager({
    renderer: options.renderer,
    vegFileBytes: options.vegFileBytes,
    vegetationRuntimeConfig: options.vegetationRuntimeConfig,
    layerModules: options.layerModules,
    datasetCreationAdapter: options.datasetCreationAdapter,
    ...(options.cancellationSignal
      ? { cancellationSignal: options.cancellationSignal }
      : {}),
  });
  try {
    return new ThreeVegetationSceneBinding(
      runtime,
      options.scene,
      options.camera,
      options.vegetationParent,
      options.frameStateProvider,
    );
  } catch (error) {
    runtime.destroy();
    throw error;
  }
}
