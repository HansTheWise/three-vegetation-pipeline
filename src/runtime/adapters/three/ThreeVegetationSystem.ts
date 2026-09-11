import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

import type { VegetationRuntimeLayerConfig } from '../../config/types.js';
import type {
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from '../../preparation/types.js';
import type { WebGLVegetationLayerModule } from '../../rendering/webgl/WebGLVegetationLayerModule.js';
import type { ThreeVegetationCameraAdapter } from './ThreeCameraAdapter.js';
import {
  createThreeVegetation,
  type ThreeVegetationSceneAdapter,
} from './ThreeVegetationSceneAdapter.js';

export type CreateThreeVegetationSystemOptions = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  coordinateRoot?: Object3D;
  preparation?: VegetationPreparationAdapter;
  cameraAdapter?: ThreeVegetationCameraAdapter;
}>;

export type CreateThreeVegetationInstanceOptions = Readonly<{
  source: VegetationRuntimeSource;
  layers: readonly VegetationRuntimeLayerConfig[];
  signal?: AbortSignal;
}>;

/** Reusable Three.js entry point that owns standard adapters and layer registration. */
export class ThreeVegetationSystem {
  readonly #options: CreateThreeVegetationSystemOptions;
  readonly #modules = new Map<string, WebGLVegetationLayerModule>();

  constructor(options: CreateThreeVegetationSystemOptions) {
    this.#options = options;
  }

  registerLayerModule(module: WebGLVegetationLayerModule): this {
    if (module.profileType.trim().length === 0) {
      throw new Error('Vegetation layer module profileType must not be empty.');
    }
    if (this.#modules.has(module.profileType)) {
      throw new Error(`Vegetation layer module "${module.profileType}" is already registered.`);
    }
    this.#modules.set(module.profileType, module);
    return this;
  }

  create(
    options: CreateThreeVegetationInstanceOptions,
  ): Promise<ThreeVegetationSceneAdapter> {
    return createThreeVegetation({
      ...this.#options,
      source: options.source,
      config: { configVersion: 3, layers: options.layers },
      layerModules: [...this.#modules.values()],
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }
}

export function createThreeVegetationSystem(
  options: CreateThreeVegetationSystemOptions,
): ThreeVegetationSystem {
  return new ThreeVegetationSystem(options);
}
