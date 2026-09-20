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
} from './ModelInputTypes.js';

export type ThreeGlbReaderOptions = Readonly<{
  includeInvisibleObjects?: boolean;
}>;

/** Reads a static GLB into vegetation-independent mesh primitives. */
export class ThreeGlbReader {
  readonly #includeInvisibleObjects: boolean;

  constructor(options: ThreeGlbReaderOptions = {}) {
    this.#includeInvisibleObjects = options.includeInvisibleObjects ?? false;
  }

  async readGlb(sourceGlb: ArrayBuffer): Promise<ModelData> {
    const loadedGlb = await new GLTFLoader().parseAsync(sourceGlb, '');
    return this.readModelRoot(loadedGlb.scene);
  }

  /**
   * Converts an already loaded Three.js root. This keeps GLB decoding and
   * scene traversal on the same tested path.
   */
  readModelRoot(modelRoot: Object3D): ModelData {
    modelRoot.updateWorldMatrix(true, true);

    // GLB nodes may be nested and transformed. Normalize every included mesh
    // into the local coordinate system of the supplied model root.
    const modelRootWorldInverse = modelRoot.matrixWorld.clone().invert();
    const modelPrimitives: ModelPrimitive[] = [];
    const modelLocalBounds = new Box3();
    let includedMeshCount = 0;
    let includedTriangleCount = 0;

    const collectMeshPrimitives = (object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const meshPrimitives = this.#createModelPrimitivesFromMesh(
        modelRoot,
        object,
        modelRootWorldInverse,
        modelLocalBounds,
      );
      if (meshPrimitives.length === 0) return;
      includedMeshCount += 1;
      for (const primitive of meshPrimitives) {
        modelPrimitives.push(primitive);
        includedTriangleCount += primitive.triangleVertexIndices.length / 3;
      }
    };

    if (this.#includeInvisibleObjects) modelRoot.traverse(collectMeshPrimitives);
    else modelRoot.traverseVisible(collectMeshPrimitives);

    return {
      primitives: modelPrimitives,
      modelLocalBounds: modelLocalBounds.isEmpty()
        ? null
        : convertBox3ToBounds3(modelLocalBounds),
      includedMeshCount,
      includedTriangleCount,
    };
  }

  #createModelPrimitivesFromMesh(
    modelRoot: Object3D,
    mesh: Mesh,
    modelRootWorldInverse: Matrix4,
    modelLocalBounds: Box3,
  ): ModelPrimitive[] {
    if (mesh instanceof InstancedMesh) {
      throw new Error(`Instanced mesh "${getObjectDisplayName(mesh)}" is not supported.`);
    }
    if (mesh instanceof SkinnedMesh) {
      throw new Error(`Skinned mesh "${getObjectDisplayName(mesh)}" is not supported.`);
    }
    if (hasActiveMorphTargets(mesh)) {
      throw new Error(`Morph targets on mesh "${getObjectDisplayName(mesh)}" are not supported.`);
    }

    const positionAttribute = mesh.geometry.getAttribute('position');
    if (!positionAttribute || positionAttribute.itemSize < 3) {
      throw new Error(`Mesh "${getObjectDisplayName(mesh)}" has no 3D position attribute.`);
    }

    const meshToModelRootTransform = new Matrix4().multiplyMatrices(
      modelRootWorldInverse,
      mesh.matrixWorld,
    );
    const transformedVertexPosition = new Vector3();
    const modelLocalVertexPositions = new Float32Array(positionAttribute.count * 3);
    for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex += 1) {
      transformedVertexPosition
        .fromBufferAttribute(positionAttribute, vertexIndex)
        .applyMatrix4(meshToModelRootTransform);
      if (![transformedVertexPosition.x, transformedVertexPosition.y, transformedVertexPosition.z]
        .every(Number.isFinite)) {
        throw new Error(`Mesh "${getObjectDisplayName(mesh)}" contains a non-finite vertex.`);
      }
      const offset = vertexIndex * 3;
      modelLocalVertexPositions[offset] = transformedVertexPosition.x;
      modelLocalVertexPositions[offset + 1] = transformedVertexPosition.y;
      modelLocalVertexPositions[offset + 2] = transformedVertexPosition.z;
    }

    // Material groups select different triangle ranges from the same vertex
    // data, so their ModelPrimitives deliberately share the position array.
    const trianglePrimitiveRanges = getTrianglePrimitiveRanges(mesh);
    const hierarchyNodeNames = getHierarchyNodeNames(modelRoot, mesh);
    const modelPrimitives: ModelPrimitive[] = [];

    for (const primitiveRange of trianglePrimitiveRanges) {
      const triangleVertexIndices = readTriangleVertexIndices(
        mesh.geometry,
        primitiveRange.elementStart,
        primitiveRange.elementCount,
      );
      if (triangleVertexIndices.length === 0) continue;
      expandModelBoundsFromTriangleIndices(
        modelLocalBounds,
        modelLocalVertexPositions,
        triangleVertexIndices,
        transformedVertexPosition,
      );
      modelPrimitives.push({
        hierarchyNodeNames,
        materialName: primitiveRange.material?.name ?? '',
        modelLocalVertexPositions,
        triangleVertexIndices,
      });
    }
    return modelPrimitives;
  }
}

type TrianglePrimitiveRange = Readonly<{
  elementStart: number;
  elementCount: number;
  material: Material | undefined;
}>;

function getTrianglePrimitiveRanges(mesh: Mesh): readonly TrianglePrimitiveRange[] {
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
      elementStart: drawStart,
      elementCount: Math.max(0, drawEnd - drawStart),
      material: materials[0],
    }];
  }

  return geometry.groups.flatMap((group) => {
    const start = Math.max(drawStart, group.start);
    const end = Math.min(drawEnd, group.start + group.count);
    if (end <= start) return [];
    return [{
      elementStart: start,
      elementCount: end - start,
      material: materials[group.materialIndex ?? 0],
    }];
  });
}

function readTriangleVertexIndices(
  geometry: BufferGeometry,
  elementStart: number,
  elementCount: number,
): Uint32Array {
  if (elementStart % 3 !== 0 || elementCount % 3 !== 0) {
    throw new Error('Triangle primitive range must contain complete triangles.');
  }
  const triangleVertexIndices = new Uint32Array(elementCount);
  for (let offset = 0; offset < elementCount; offset += 1) {
    const geometryElementOffset = elementStart + offset;
    triangleVertexIndices[offset] = geometry.index?.getX(geometryElementOffset)
      ?? geometryElementOffset;
  }
  return triangleVertexIndices;
}

function expandModelBoundsFromTriangleIndices(
  modelLocalBounds: Box3,
  modelLocalVertexPositions: Float32Array,
  triangleVertexIndices: Uint32Array,
  vertexPosition: Vector3,
): void {
  for (const index of triangleVertexIndices) {
    const offset = index * 3;
    const x = modelLocalVertexPositions[offset];
    const y = modelLocalVertexPositions[offset + 1];
    const z = modelLocalVertexPositions[offset + 2];
    if (x === undefined || y === undefined || z === undefined) {
      throw new Error(`Triangle index ${index} exceeds the position attribute.`);
    }
    modelLocalBounds.expandByPoint(vertexPosition.set(x, y, z));
  }
}

function getHierarchyNodeNames(
  modelRoot: Object3D,
  object: Object3D,
): readonly string[] {
  const hierarchyNodeNames: string[] = [];
  let current: Object3D | null = object;
  while (current) {
    if (current.name) hierarchyNodeNames.push(current.name);
    if (current === modelRoot) break;
    current = current.parent;
  }
  return hierarchyNodeNames.reverse();
}

function hasActiveMorphTargets(mesh: Mesh): boolean {
  return Boolean(
    mesh.morphTargetInfluences?.some((influence) => influence !== 0),
  );
}

function getObjectDisplayName(object: Object3D): string {
  return object.name || object.uuid;
}

function convertBox3ToBounds3(bounds: Box3): Bounds3 {
  return {
    minX: bounds.min.x,
    minY: bounds.min.y,
    minZ: bounds.min.z,
    maxX: bounds.max.x,
    maxY: bounds.max.y,
    maxZ: bounds.max.z,
  };
}
