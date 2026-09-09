import type {
  ChunkBoundingBoxes,
  ClipSpaceDepthRange,
  Matrix4Elements,
} from './types.js';
import { FrustumPlanes } from './FrustumPlanes.js';

/** Reuses its result and plane buffers across frames. */
export class FrustumChunkVisibility {
  readonly visibleChunkIndices: Uint32Array;
  visibleChunkCount = 0;

  readonly #chunkBoundingBoxes: ChunkBoundingBoxes;
  readonly #frustumPlanes = new FrustumPlanes();

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
    this.#frustumPlanes.update(clipFromModelMatrix, depthRange);

    let visibleChunkCount = 0;
    for (
      let storedChunkIndex = 0;
      storedChunkIndex < this.#chunkBoundingBoxes.storedChunkCount;
      storedChunkIndex += 1
    ) {
      if (!this.#frustumPlanes.intersectsBounds(
        this.#chunkBoundingBoxes.minMaxCoordinates,
        storedChunkIndex * 6,
      )) continue;

      this.visibleChunkIndices[visibleChunkCount] = storedChunkIndex;
      visibleChunkCount += 1;
    }
    this.visibleChunkCount = visibleChunkCount;
    return visibleChunkCount;
  }
}
