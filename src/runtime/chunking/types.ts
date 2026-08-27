export type ClipSpaceDepthRange = 'negative-one-to-one' | 'zero-to-one';

export type Matrix4Elements = Readonly<{
  length: number;
  [index: number]: number;
}>;

/**
 * Six model-local Float32 coordinates per stored chunk bounding box:
 * minX, minY, minZ, maxX, maxY, maxZ.
 */
export type ChunkBoundingBoxes = Readonly<{
  storedChunkCount: number;
  minMaxCoordinates: Float32Array;
}>;
