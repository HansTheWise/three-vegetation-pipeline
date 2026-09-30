import type { Bounds3 } from '../../shared/vegfile-format/VegetationFileTypes.js';

export type { Bounds3 } from '../../shared/vegfile-format/VegetationFileTypes.js';

/**
 * One triangle primitive in the coordinate system of the GLB root object.
 * Multiple primitives may share the same positions array when a mesh uses
 * multiple materials.
 */
export type ModelPrimitive = Readonly<{
  /** Named nodes from the GLB root through the source mesh. */
  hierarchyNodeNames: readonly string[];
  materialName: string;
  /** Vertex positions transformed into the local space of the GLB root. */
  modelLocalVertexPositions: Float32Array;
  /** Triangle vertex indices into modelLocalVertexPositions. */
  triangleVertexIndices: Uint32Array;
}>;

/** Neutral reader output. Vegetation-specific selection starts afterwards. */
export type ModelData = Readonly<{
  primitives: readonly ModelPrimitive[];
  modelLocalBounds: Bounds3 | null;
}>;
