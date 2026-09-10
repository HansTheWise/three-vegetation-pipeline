import { Matrix4, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { ThreeCameraAdapter } from '../src/index.js';

describe('ThreeCameraAdapter', () => {
  it('reuses frame data and converts a transformed coordinate root correctly', () => {
    const root = new Object3D();
    root.position.set(4, -2, 7);
    root.rotation.set(0.2, -0.4, 0.1);
    root.scale.set(2, 3, 4);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 500);
    camera.position.set(12, 8, 20);
    camera.lookAt(4, 0, 7);
    const adapter = new ThreeCameraAdapter(camera, root);

    const first = adapter.update();
    const expectedCameraPosition = root.worldToLocal(
      new Vector3().setFromMatrixPosition(camera.matrixWorld),
    );
    const expectedClipFromModel = new Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(root.matrixWorld);

    expect(first.cameraPositionModel).toMatchObject({
      x: expectedCameraPosition.x,
      y: expectedCameraPosition.y,
      z: expectedCameraPosition.z,
    });
    expect(Array.from(first.clipFromModelMatrix)).toEqual(expectedClipFromModel.elements);
    expect(first.clipSpaceDepthRange).toBe('negative-one-to-one');

    camera.position.x += 3;
    const second = adapter.update();
    expect(second).toBe(first);
    expect(second.cameraPositionModel).toBe(first.cameraPositionModel);
    expect(second.clipFromModelMatrix).toBe(first.clipFromModelMatrix);
  });

  it('accepts an override camera without replacing its configured default', () => {
    const root = new Object3D();
    const defaultCamera = new PerspectiveCamera();
    defaultCamera.position.set(1, 2, 3);
    const overrideCamera = new PerspectiveCamera();
    overrideCamera.position.set(4, 5, 6);
    const adapter = new ThreeCameraAdapter(defaultCamera, root);

    expect(adapter.update(overrideCamera).cameraPositionModel).toMatchObject({ x: 4, y: 5, z: 6 });
    expect(adapter.update().cameraPositionModel).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('rejects a non-invertible coordinate root', () => {
    const root = new Object3D();
    root.scale.set(1, 0, 1);
    const adapter = new ThreeCameraAdapter(new PerspectiveCamera(), root);

    expect(() => adapter.update()).toThrow('coordinateRoot matrix must be invertible');
  });
});
