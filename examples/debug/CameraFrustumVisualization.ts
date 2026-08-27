import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';

const CLIP_SPACE_CORNERS = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
] as const;

const SURFACE_INDICES = [
  0, 2, 1, 0, 3, 2,
  4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4,
  1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6,
  3, 0, 4, 3, 4, 7,
] as const;

const EDGE_INDICES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
] as const;

export class CameraFrustumVisualization {
  readonly group = new Group();

  readonly #surfaceGeometry = createGeometry(SURFACE_INDICES);
  readonly #outlineGeometry = createGeometry(EDGE_INDICES);
  readonly #surfaceMaterial = new MeshBasicMaterial({
    color: '#2563eb',
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: DoubleSide,
  });
  readonly #outlineMaterial = new LineBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.8,
  });
  readonly #clipFromWorld = new Matrix4();
  readonly #worldCorner = new Vector3();

  constructor() {
    this.group.name = 'debug/culling-camera-frustum';
    this.group.add(
      new Mesh(this.#surfaceGeometry, this.#surfaceMaterial),
      new LineSegments(this.#outlineGeometry, this.#outlineMaterial),
    );
    this.group.visible = false;
  }

  update(camera: PerspectiveCamera): void {
    this.#clipFromWorld
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
    updateGeometryCorners(this.#surfaceGeometry, this.#clipFromWorld, this.#worldCorner);
    updateGeometryCorners(this.#outlineGeometry, this.#clipFromWorld, this.#worldCorner);
  }

  dispose(): void {
    this.#surfaceGeometry.dispose();
    this.#outlineGeometry.dispose();
    this.#surfaceMaterial.dispose();
    this.#outlineMaterial.dispose();
  }
}

function createGeometry(indices: readonly number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(8 * 3, 3));
  geometry.setIndex(Array.from(indices));
  return geometry;
}

function updateGeometryCorners(
  geometry: BufferGeometry,
  worldFromClip: Matrix4,
  worldCorner: Vector3,
): void {
  const positions = geometry.getAttribute('position');
  CLIP_SPACE_CORNERS.forEach((corner, index) => {
    worldCorner.set(corner[0], corner[1], corner[2]).applyMatrix4(worldFromClip);
    positions.setXYZ(index, worldCorner.x, worldCorner.y, worldCorner.z);
  });
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}
