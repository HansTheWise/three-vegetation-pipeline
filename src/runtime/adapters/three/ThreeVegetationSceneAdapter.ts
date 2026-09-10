import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

import type { VegetationRuntimeConfig } from '../../config/types.js';
import type { VegetationPreparationAdapter, VegetationRuntimeSource } from '../../preparation/types.js';
import type { WebGLVegetationLayerRendererFactory } from '../../rendering/webgl/WebGLVegetationLayerRenderer.js';
import {
  createWebGLVegetationRuntime,
  type WebGLVegetationRuntime,
  type WebGLVegetationRuntimeDiagnostics,
} from '../../webgl/WebGLVegetationRuntime.js';
import {
  ThreeCameraAdapter,
  type ThreeVegetationCameraAdapter,
} from './ThreeCameraAdapter.js';

export type CreateThreeVegetationOptions = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  coordinateRoot?: Object3D;
  source: VegetationRuntimeSource;
  config: VegetationRuntimeConfig;
  preparation?: VegetationPreparationAdapter;
  layerRenderers?: readonly WebGLVegetationLayerRendererFactory[];
  cameraAdapter?: ThreeVegetationCameraAdapter;
  signal?: AbortSignal;
}>;

/** Standard Three.js ownership boundary for scene binding, camera updates and cleanup. */
export class ThreeVegetationSceneAdapter {
  readonly runtime: WebGLVegetationRuntime;
  readonly cameraAdapter: ThreeVegetationCameraAdapter;
  readonly object3d: Object3D;
  #disposed = false;

  constructor(
    runtime: WebGLVegetationRuntime,
    scene: Scene,
    camera: Camera,
    coordinateRoot: Object3D = scene,
    cameraAdapter?: ThreeVegetationCameraAdapter,
  ) {
    this.runtime = runtime;
    this.object3d = runtime.object3d;
    coordinateRoot.add(this.object3d);
    this.cameraAdapter = cameraAdapter ?? new ThreeCameraAdapter(camera, this.object3d);
  }

  get diagnostics(): WebGLVegetationRuntimeDiagnostics {
    return this.runtime.diagnostics;
  }

  updateFrame(camera?: Camera): void {
    this.#assertActive();
    this.runtime.updateFrame(this.cameraAdapter.update(camera));
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
    if (this.#disposed) throw new Error('Three vegetation scene adapter is already disposed.');
  }
}

export async function createThreeVegetation(
  options: CreateThreeVegetationOptions,
): Promise<ThreeVegetationSceneAdapter> {
  const runtime = await createWebGLVegetationRuntime({
    renderer: options.renderer,
    source: options.source,
    config: options.config,
    ...(options.preparation ? { preparation: options.preparation } : {}),
    ...(options.layerRenderers ? { layerRenderers: options.layerRenderers } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  try {
    return new ThreeVegetationSceneAdapter(
      runtime,
      options.scene,
      options.camera,
      options.coordinateRoot,
      options.cameraAdapter,
    );
  } catch (error) {
    runtime.dispose();
    throw error;
  }
}
