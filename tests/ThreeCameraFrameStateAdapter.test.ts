import { Matrix4, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { ThreeCameraFrameStateAdapter } from '../src/package-entrypoints/InternalDevelopmentApi.js';

describe('ThreeCameraFrameStateAdapter', () => {
  it('reuses frame data and converts a transformed vegetation model root correctly', () => {
    const vegetationModelRoot = new Object3D();
    vegetationModelRoot.position.set(4, -2, 7);
    vegetationModelRoot.rotation.set(0.2, -0.4, 0.1);
    vegetationModelRoot.scale.set(2, 3, 4);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 500);
    camera.position.set(12, 8, 20);
    camera.lookAt(4, 0, 7);
    const frameStateAdapter = new ThreeCameraFrameStateAdapter(camera, vegetationModelRoot);

    const firstFrameState = frameStateAdapter.updateFrameState();
    const expectedCameraPosition = vegetationModelRoot.worldToLocal(
      new Vector3().setFromMatrixPosition(camera.matrixWorld),
    );
    const expectedClipFromModel = new Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(vegetationModelRoot.matrixWorld);

    expect(firstFrameState.cameraPositionModel).toMatchObject({
      x: expectedCameraPosition.x,
      y: expectedCameraPosition.y,
      z: expectedCameraPosition.z,
    });
    expect(Array.from(firstFrameState.clipFromModelMatrix)).toEqual(expectedClipFromModel.elements);
    expect(firstFrameState.clipSpaceDepthRange).toBe('negative-one-to-one');

    camera.position.x += 3;
    const secondFrameState = frameStateAdapter.updateFrameState();
    expect(secondFrameState).toBe(firstFrameState);
    expect(secondFrameState.cameraPositionModel).toBe(firstFrameState.cameraPositionModel);
    expect(secondFrameState.clipFromModelMatrix).toBe(firstFrameState.clipFromModelMatrix);
  });

  it('accepts an override camera without replacing its configured default', () => {
    const vegetationModelRoot = new Object3D();
    const defaultCamera = new PerspectiveCamera();
    defaultCamera.position.set(1, 2, 3);
    const overrideCamera = new PerspectiveCamera();
    overrideCamera.position.set(4, 5, 6);
    const frameStateAdapter = new ThreeCameraFrameStateAdapter(
      defaultCamera,
      vegetationModelRoot,
    );

    expect(frameStateAdapter.updateFrameState(overrideCamera).cameraPositionModel)
      .toMatchObject({ x: 4, y: 5, z: 6 });
    expect(frameStateAdapter.updateFrameState().cameraPositionModel)
      .toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('rejects a non-invertible vegetation model root', () => {
    const vegetationModelRoot = new Object3D();
    vegetationModelRoot.scale.set(1, 0, 1);
    const frameStateAdapter = new ThreeCameraFrameStateAdapter(
      new PerspectiveCamera(),
      vegetationModelRoot,
    );

    expect(() => frameStateAdapter.updateFrameState())
      .toThrow('Vegetation model root matrix must be invertible');
  });
});
