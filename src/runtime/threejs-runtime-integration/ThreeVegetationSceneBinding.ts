import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

import type { VegetationRuntimeConfig } from '../runtime-dataset-preparation/configuration/VegetationRuntimeConfig.js';
import type {
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from '../runtime-dataset-preparation/worker-preparation/VegetationPreparationTypes.js';
import type { WebGLVegetationLayerModule } from '../vegetation-layer-rendering-contracts/WebGLVegetationLayerModule.js';
import {
  createWebGLVegetationRuntime,
  type WebGLVegetationRuntime,
  type WebGLVegetationRuntimeDiagnostics,
} from '../vegetation-runtime-orchestration/WebGLVegetationRuntime.js';
import {
  ThreeCameraFrameStateAdapter,
  type ThreeVegetationFrameStateProvider,
} from './ThreeCameraFrameStateAdapter.js';

export type CreateThreeVegetationSceneBindingOptions = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  vegetationParent?: Object3D;
  source: VegetationRuntimeSource;
  config: VegetationRuntimeConfig;
  layerModules: readonly WebGLVegetationLayerModule[];
  preparation?: VegetationPreparationAdapter;
  frameStateProvider?: ThreeVegetationFrameStateProvider;
  signal?: AbortSignal;
}>;

/** Binds one WebGL vegetation runtime to a Three.js scene and camera lifecycle. */
export class ThreeVegetationSceneBinding {
  readonly runtime: WebGLVegetationRuntime;
  readonly frameStateProvider: ThreeVegetationFrameStateProvider;
  readonly object3d: Object3D;
  #disposed = false;

  constructor(
    runtime: WebGLVegetationRuntime,
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

  get diagnostics(): WebGLVegetationRuntimeDiagnostics {
    return this.runtime.diagnostics;
  }

  updateFrame(camera?: Camera): void {
    this.#assertActive();
    this.runtime.updateFrame(this.frameStateProvider.updateFrameState(camera));
  }

  setLayerEnabled(layer: number | string, enabled: boolean): void {
    this.#assertActive();
    this.runtime.setLayerEnabled(layer, enabled);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.object3d.removeFromParent();
    this.runtime.dispose();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Three vegetation scene binding is already disposed.');
  }
}

export async function createThreeVegetationSceneBinding(
  options: CreateThreeVegetationSceneBindingOptions,
): Promise<ThreeVegetationSceneBinding> {
  const runtime = await createWebGLVegetationRuntime({
    renderer: options.renderer,
    source: options.source,
    config: options.config,
    layerModules: options.layerModules,
    ...(options.preparation ? { preparation: options.preparation } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
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
    runtime.dispose();
    throw error;
  }
}
