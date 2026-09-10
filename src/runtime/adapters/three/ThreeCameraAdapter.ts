import { Camera, Matrix4, Object3D, Vector3 } from 'three';

import type { ClipSpaceDepthRange } from '../../chunking/types.js';
import type { VegetationFrameState } from '../../frame/types.js';

export interface ThreeVegetationCameraAdapter {
  update(camera?: Camera): VegetationFrameState;
}

/** Converts a Three.js camera and coordinate root into reusable model-space frame data. */
export class ThreeCameraAdapter implements ThreeVegetationCameraAdapter {
  readonly camera: Camera;
  readonly coordinateRoot: Object3D;
  readonly frameState: VegetationFrameState;

  readonly #clipFromModelMatrix = new Matrix4();
  readonly #modelFromWorldMatrix = new Matrix4();
  readonly #cameraPositionModel = new Vector3();
  readonly #clipSpaceDepthRange: ClipSpaceDepthRange;

  constructor(
    camera: Camera,
    coordinateRoot: Object3D,
    clipSpaceDepthRange: ClipSpaceDepthRange = 'negative-one-to-one',
  ) {
    this.camera = camera;
    this.coordinateRoot = coordinateRoot;
    this.#clipSpaceDepthRange = clipSpaceDepthRange;
    this.frameState = {
      cameraPositionModel: this.#cameraPositionModel,
      clipFromModelMatrix: this.#clipFromModelMatrix.elements,
      clipSpaceDepthRange,
    };
  }

  /** Updates and returns the same frame-state object on every call. */
  update(camera: Camera = this.camera): VegetationFrameState {
    this.coordinateRoot.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    if (this.coordinateRoot.matrixWorld.determinant() === 0) {
      throw new Error('Vegetation coordinateRoot matrix must be invertible.');
    }
    this.#clipFromModelMatrix
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(this.coordinateRoot.matrixWorld);
    this.#modelFromWorldMatrix.copy(this.coordinateRoot.matrixWorld).invert();
    this.#cameraPositionModel
      .setFromMatrixPosition(camera.matrixWorld)
      .applyMatrix4(this.#modelFromWorldMatrix);
    return this.frameState;
  }
}
