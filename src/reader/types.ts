export type Bounds3 = Readonly<{
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}>;

/**
 * One triangle primitive in the coordinate system of the GLB root object.
 * Multiple primitives may share the same positions array when a mesh uses
 * multiple materials.
 */
export type ModelPrimitive = Readonly<{
  meshName: string;
  nodePath: string;
  hierarchyNames: readonly string[];
  materialName: string;
  meshUserData: Readonly<Record<string, unknown>>;
  materialUserData: Readonly<Record<string, unknown>>;
  positions: Float32Array;
  indices: Uint32Array;
}>;

/** Neutral reader output. Vegetation-specific selection starts afterwards. */
export type ModelData = Readonly<{
  coordinateSpace: 'model-local';
  primitives: readonly ModelPrimitive[];
  bounds: Bounds3 | null;
  sourceMeshCount: number;
  triangleCount: number;
}>;

export interface ModelReader<TSource> {
  read(source: TSource): Promise<ModelData>;
}
