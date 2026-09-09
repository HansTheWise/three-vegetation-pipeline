import type { ClipSpaceDepthRange, Matrix4Elements } from './types.js';

const VALUES_PER_PLANE = 4;

/** Reusable plane extraction and axis-aligned bounds testing for CPU culling. */
export class FrustumPlanes {
  readonly #planes = new Float64Array(6 * VALUES_PER_PLANE);

  update(clipFromModelMatrix: Matrix4Elements, depthRange: ClipSpaceDepthRange): void {
    if (clipFromModelMatrix.length !== 16) {
      throw new Error('clipFromModelMatrix must contain exactly 16 values.');
    }
    for (let index = 0; index < clipFromModelMatrix.length; index += 1) {
      if (!Number.isFinite(clipFromModelMatrix[index])) {
        throw new Error('clipFromModelMatrix must contain only finite values.');
      }
    }

    setPlane(this.#planes, 0, clipFromModelMatrix, 3, 0, 1);
    setPlane(this.#planes, 1, clipFromModelMatrix, 3, 0, -1);
    setPlane(this.#planes, 2, clipFromModelMatrix, 3, 1, 1);
    setPlane(this.#planes, 3, clipFromModelMatrix, 3, 1, -1);
    if (depthRange === 'negative-one-to-one') {
      setPlane(this.#planes, 4, clipFromModelMatrix, 3, 2, 1);
    } else if (depthRange === 'zero-to-one') {
      copyMatrixRowToPlane(this.#planes, 4, clipFromModelMatrix, 2);
    } else {
      throw new Error(`Unsupported clip-space depth range "${String(depthRange)}".`);
    }
    setPlane(this.#planes, 5, clipFromModelMatrix, 3, 2, -1);
  }

  intersectsBounds(bounds: Float32Array | Float64Array, offset = 0): boolean {
    return this.intersects(
      bounds[offset]!, bounds[offset + 1]!, bounds[offset + 2]!,
      bounds[offset + 3]!, bounds[offset + 4]!, bounds[offset + 5]!,
    );
  }

  intersects(
    minimumX: number,
    minimumY: number,
    minimumZ: number,
    maximumX: number,
    maximumY: number,
    maximumZ: number,
  ): boolean {
    for (let planeOffset = 0; planeOffset < this.#planes.length; planeOffset += VALUES_PER_PLANE) {
      const normalX = this.#planes[planeOffset]!;
      const normalY = this.#planes[planeOffset + 1]!;
      const normalZ = this.#planes[planeOffset + 2]!;
      const maximumDistance = normalX * (normalX >= 0 ? maximumX : minimumX)
        + normalY * (normalY >= 0 ? maximumY : minimumY)
        + normalZ * (normalZ >= 0 ? maximumZ : minimumZ)
        + this.#planes[planeOffset + 3]!;
      if (maximumDistance < 0) return false;
    }
    return true;
  }
}

function setPlane(
  planes: Float64Array,
  planeIndex: number,
  matrix: Matrix4Elements,
  firstRow: number,
  secondRow: number,
  secondFactor: 1 | -1,
): void {
  const planeOffset = planeIndex * VALUES_PER_PLANE;
  for (let column = 0; column < 4; column += 1) {
    planes[planeOffset + column] = matrix[column * 4 + firstRow]!
      + secondFactor * matrix[column * 4 + secondRow]!;
  }
}

function copyMatrixRowToPlane(
  planes: Float64Array,
  planeIndex: number,
  matrix: Matrix4Elements,
  row: number,
): void {
  const planeOffset = planeIndex * VALUES_PER_PLANE;
  for (let column = 0; column < 4; column += 1) {
    planes[planeOffset + column] = matrix[column * 4 + row]!;
  }
}
