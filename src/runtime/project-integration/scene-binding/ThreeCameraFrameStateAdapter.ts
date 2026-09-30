import { Camera, Matrix4, Object3D, Vector3 } from 'three';

import type { ClipSpaceDepthRange } from '../../chunk-visibility-management/frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';
import type { VegetationFrameState } from '../../VegetationRuntimeManager.js';

export interface ThreeVegetationFrameStateProvider {
  updateFrameState(camera?: Camera): VegetationFrameState;
}

/** Converts a Three.js camera into reusable vegetation-model-space frame data. */
export class ThreeCameraFrameStateAdapter implements ThreeVegetationFrameStateProvider {
  readonly camera: Camera;
  readonly vegetationModelRoot: Object3D;
  readonly frameState: VegetationFrameState;

  readonly #clipFromVegetationModelMatrix = new Matrix4();
  readonly #vegetationModelFromWorldMatrix = new Matrix4();
  readonly #cameraPositionInVegetationModel = new Vector3();

  constructor(
    camera: Camera,
    vegetationModelRoot: Object3D,
    clipSpaceDepthRange: ClipSpaceDepthRange = 'negative-one-to-one',
  ) {
    this.camera = camera;
    this.vegetationModelRoot = vegetationModelRoot;
    this.frameState = {
      cameraPositionModel: this.#cameraPositionInVegetationModel,
      clipFromModelMatrix: this.#clipFromVegetationModelMatrix.elements,
      clipSpaceDepthRange,
    };
  }

  /** Updates and returns the same frame-state object on every call. */
  updateFrameState(camera: Camera = this.camera): VegetationFrameState {
    this.vegetationModelRoot.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    if (this.vegetationModelRoot.matrixWorld.determinant() === 0) {
      throw new Error('Vegetation model root matrix must be invertible.');
    }
    this.#clipFromVegetationModelMatrix
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(this.vegetationModelRoot.matrixWorld);
    this.#vegetationModelFromWorldMatrix
      .copy(this.vegetationModelRoot.matrixWorld)
      .invert();
    this.#cameraPositionInVegetationModel
      .setFromMatrixPosition(camera.matrixWorld)
      .applyMatrix4(this.#vegetationModelFromWorldMatrix);
    return this.frameState;
  }
}
