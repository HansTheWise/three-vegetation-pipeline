import {
  Box3,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  SkinnedMesh,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type {
  Bounds3,
  ModelData,
  ModelPrimitive,
  ModelReader,
} from './types.js';

export type ThreeGlbReaderOptions = Readonly<{
  includeInvisibleObjects?: boolean;
}>;

/** Reads a static GLB into vegetation-independent mesh primitives. */
export class ThreeGlbReader implements ModelReader<ArrayBuffer> {
  readonly #includeInvisibleObjects: boolean;

  constructor(options: ThreeGlbReaderOptions = {}) {
    this.#includeInvisibleObjects = options.includeInvisibleObjects ?? false;
  }

  async read(source: ArrayBuffer): Promise<ModelData> {
    const gltf = await new GLTFLoader().parseAsync(source, '');
    return this.readObject(gltf.scene);
  }

  /**
   * Converts an already loaded Three.js root. This keeps GLB decoding and
   * scene traversal on the same tested path.
   */
  readObject(root: Object3D): ModelData {
    root.updateWorldMatrix(true, true);

    const rootWorldInverse = root.matrixWorld.clone().invert();
    const primitives: ModelPrimitive[] = [];
    const bounds = new Box3();
    let sourceMeshCount = 0;
    let triangleCount = 0;

    const visit = (object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const meshPrimitives = this.#readMesh(
        root,
        object,
        rootWorldInverse,
        bounds,
      );
      if (meshPrimitives.length === 0) return;
      sourceMeshCount += 1;
      for (const primitive of meshPrimitives) {
        primitives.push(primitive);
        triangleCount += primitive.indices.length / 3;
      }
    };

    if (this.#includeInvisibleObjects) root.traverse(visit);
    else root.traverseVisible(visit);

    return {
      coordinateSpace: 'model-local',
      primitives,
      bounds: bounds.isEmpty() ? null : toBounds3(bounds),
      sourceMeshCount,
      triangleCount,
    };
  }

  #readMesh(
    root: Object3D,
    mesh: Mesh,
    rootWorldInverse: Matrix4,
    bounds: Box3,
  ): ModelPrimitive[] {
    if (mesh instanceof InstancedMesh) {
      throw new Error(`Instanced mesh "${displayName(mesh)}" is not supported.`);
    }
    if (mesh instanceof SkinnedMesh) {
      throw new Error(`Skinned mesh "${displayName(mesh)}" is not supported.`);
    }
    if (hasActiveMorphTargets(mesh)) {
      throw new Error(`Morph targets on mesh "${displayName(mesh)}" are not supported.`);
    }

    const position = mesh.geometry.getAttribute('position');
    if (!position || position.itemSize < 3) {
      throw new Error(`Mesh "${displayName(mesh)}" has no 3D position attribute.`);
    }

    const meshToRoot = new Matrix4().multiplyMatrices(
      rootWorldInverse,
      mesh.matrixWorld,
    );
    const point = new Vector3();
    const positions = new Float32Array(position.count * 3);
    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      point.fromBufferAttribute(position, vertexIndex).applyMatrix4(meshToRoot);
      if (![point.x, point.y, point.z].every(Number.isFinite)) {
        throw new Error(`Mesh "${displayName(mesh)}" contains a non-finite vertex.`);
      }
      const offset = vertexIndex * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
    }

    const ranges = getPrimitiveRanges(mesh);
    const hierarchyNames = getHierarchyNames(root, mesh);
    const nodePath = hierarchyNames.join('/');
    const meshUserData = { ...mesh.userData } as Readonly<Record<string, unknown>>;
    const result: ModelPrimitive[] = [];

    for (const range of ranges) {
      const indices = readTriangleIndices(mesh.geometry, range.start, range.count);
      if (indices.length === 0) continue;
      expandBoundsFromIndices(bounds, positions, indices, point);
      result.push({
        meshName: mesh.name,
        nodePath,
        hierarchyNames,
        materialName: range.material?.name ?? '',
        meshUserData,
        materialUserData: range.material
          ? { ...range.material.userData }
          : {},
        positions,
        indices,
      });
    }
    return result;
  }
}

type PrimitiveRange = Readonly<{
  start: number;
  count: number;
  material: Material | undefined;
}>;

function getPrimitiveRanges(mesh: Mesh): readonly PrimitiveRange[] {
  const geometry = mesh.geometry;
  const elementCount = geometry.index?.count
    ?? geometry.getAttribute('position')?.count
    ?? 0;
  const drawStart = Math.max(0, geometry.drawRange.start);
  const drawCount = Number.isFinite(geometry.drawRange.count)
    ? geometry.drawRange.count
    : elementCount - drawStart;
  const drawEnd = Math.min(elementCount, drawStart + drawCount);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  if (geometry.groups.length === 0) {
    return [{
      start: drawStart,
      count: Math.max(0, drawEnd - drawStart),
      material: materials[0],
    }];
  }

  return geometry.groups.flatMap((group) => {
    const start = Math.max(drawStart, group.start);
    const end = Math.min(drawEnd, group.start + group.count);
    if (end <= start) return [];
    return [{
      start,
      count: end - start,
      material: materials[group.materialIndex ?? 0],
    }];
  });
}

function readTriangleIndices(
  geometry: BufferGeometry,
  start: number,
  count: number,
): Uint32Array {
  if (start % 3 !== 0 || count % 3 !== 0) {
    throw new Error('Triangle primitive range must contain complete triangles.');
  }
  const result = new Uint32Array(count);
  for (let offset = 0; offset < count; offset += 1) {
    const sourceOffset = start + offset;
    result[offset] = geometry.index?.getX(sourceOffset) ?? sourceOffset;
  }
  return result;
}

function expandBoundsFromIndices(
  bounds: Box3,
  positions: Float32Array,
  indices: Uint32Array,
  point: Vector3,
): void {
  for (const index of indices) {
    const offset = index * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (x === undefined || y === undefined || z === undefined) {
      throw new Error(`Triangle index ${index} exceeds the position attribute.`);
    }
    bounds.expandByPoint(point.set(x, y, z));
  }
}

function getHierarchyNames(root: Object3D, object: Object3D): readonly string[] {
  const names: string[] = [];
  let current: Object3D | null = object;
  while (current) {
    if (current.name) names.push(current.name);
    if (current === root) break;
    current = current.parent;
  }
  return names.reverse();
}

function hasActiveMorphTargets(mesh: Mesh): boolean {
  return Boolean(
    mesh.morphTargetInfluences?.some((influence) => influence !== 0),
  );
}

function displayName(object: Object3D): string {
  return object.name || object.uuid;
}

function toBounds3(bounds: Box3): Bounds3 {
  return {
    minX: bounds.min.x,
    minY: bounds.min.y,
    minZ: bounds.min.z,
    maxX: bounds.max.x,
    maxY: bounds.max.y,
    maxZ: bounds.max.z,
  };
}
