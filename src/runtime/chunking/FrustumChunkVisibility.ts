import type {
  ChunkBoundingBoxes,
  ClipSpaceDepthRange,
  Matrix4Elements,
} from './types.js';

const COORDINATES_PER_BOUNDING_BOX = 6;
const VALUES_PER_PLANE = 4;

/** Reuses its result and plane buffers across frames. */
export class FrustumChunkVisibility {
  readonly visibleChunkIndices: Uint32Array;
  visibleChunkCount = 0;

  readonly #chunkBoundingBoxes: ChunkBoundingBoxes;
  readonly #frustumPlanes = new Float64Array(6 * VALUES_PER_PLANE);

  constructor(chunkBoundingBoxes: ChunkBoundingBoxes) {
    this.#chunkBoundingBoxes = chunkBoundingBoxes;
    this.visibleChunkIndices = new Uint32Array(chunkBoundingBoxes.storedChunkCount);
  }

  /**
   * Updates the visible stored-chunk indices from a column-major
   * projection * view * model matrix and returns the visible count.
   */
  updateVisibleChunks(
    clipFromModelMatrix: Matrix4Elements,
    depthRange: ClipSpaceDepthRange,
  ): number {
    extractFrustumPlanes(this.#frustumPlanes, clipFromModelMatrix, depthRange);

    let visibleChunkCount = 0;
    for (
      let storedChunkIndex = 0;
      storedChunkIndex < this.#chunkBoundingBoxes.storedChunkCount;
      storedChunkIndex += 1
    ) {
      if (!isBoundingBoxInFrustum(
        this.#chunkBoundingBoxes.minMaxCoordinates,
        storedChunkIndex * COORDINATES_PER_BOUNDING_BOX,
        this.#frustumPlanes,
      )) continue;

      this.visibleChunkIndices[visibleChunkCount] = storedChunkIndex;
      visibleChunkCount += 1;
    }
    this.visibleChunkCount = visibleChunkCount;
    return visibleChunkCount;
  }
}

function extractFrustumPlanes(
  frustumPlanes: Float64Array,
  matrix: Matrix4Elements,
  depthRange: ClipSpaceDepthRange,
): void {
  if (matrix.length !== 16) {
    throw new Error('clipFromModelMatrix must contain exactly 16 values.');
  }
  for (let index = 0; index < matrix.length; index += 1) {
    if (!Number.isFinite(matrix[index])) {
      throw new Error('clipFromModelMatrix must contain only finite values.');
    }
  }

  setPlane(frustumPlanes, 0, matrix, 3, 0, 1);
  setPlane(frustumPlanes, 1, matrix, 3, 0, -1);
  setPlane(frustumPlanes, 2, matrix, 3, 1, 1);
  setPlane(frustumPlanes, 3, matrix, 3, 1, -1);
  if (depthRange === 'negative-one-to-one') {
    setPlane(frustumPlanes, 4, matrix, 3, 2, 1);
  } else if (depthRange === 'zero-to-one') {
    copyMatrixRowToPlane(frustumPlanes, 4, matrix, 2);
  } else {
    throw new Error(`Unsupported clip-space depth range "${String(depthRange)}".`);
  }
  setPlane(frustumPlanes, 5, matrix, 3, 2, -1);
}

function setPlane(
  frustumPlanes: Float64Array,
  planeIndex: number,
  matrix: Matrix4Elements,
  firstRow: number,
  secondRow: number,
  secondFactor: 1 | -1,
): void {
  const planeOffset = planeIndex * VALUES_PER_PLANE;
  for (let column = 0; column < 4; column += 1) {
    frustumPlanes[planeOffset + column] = matrix[column * 4 + firstRow]!
      + secondFactor * matrix[column * 4 + secondRow]!;
  }
}

function copyMatrixRowToPlane(
  frustumPlanes: Float64Array,
  planeIndex: number,
  matrix: Matrix4Elements,
  row: number,
): void {
  const planeOffset = planeIndex * VALUES_PER_PLANE;
  for (let column = 0; column < 4; column += 1) {
    frustumPlanes[planeOffset + column] = matrix[column * 4 + row]!;
  }
}

function isBoundingBoxInFrustum(
  minMaxCoordinates: Float32Array,
  boundingBoxOffset: number,
  frustumPlanes: Float64Array,
): boolean {
  const minimumX = minMaxCoordinates[boundingBoxOffset]!;
  const minimumY = minMaxCoordinates[boundingBoxOffset + 1]!;
  const minimumZ = minMaxCoordinates[boundingBoxOffset + 2]!;
  const maximumX = minMaxCoordinates[boundingBoxOffset + 3]!;
  const maximumY = minMaxCoordinates[boundingBoxOffset + 4]!;
  const maximumZ = minMaxCoordinates[boundingBoxOffset + 5]!;

  for (
    let planeOffset = 0;
    planeOffset < frustumPlanes.length;
    planeOffset += VALUES_PER_PLANE
  ) {
    const normalX = frustumPlanes[planeOffset]!;
    const normalY = frustumPlanes[planeOffset + 1]!;
    const normalZ = frustumPlanes[planeOffset + 2]!;
    const maximumDistance = normalX * (normalX >= 0 ? maximumX : minimumX)
      + normalY * (normalY >= 0 ? maximumY : minimumY)
      + normalZ * (normalZ >= 0 ? maximumZ : minimumZ)
      + frustumPlanes[planeOffset + 3]!;
    if (maximumDistance < 0) return false;
  }
  return true;
}
