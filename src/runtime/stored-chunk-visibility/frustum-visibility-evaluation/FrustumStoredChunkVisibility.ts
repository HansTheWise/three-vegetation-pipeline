import type {
  StoredChunkCullingBounds,
  ClipSpaceDepthRange,
  Matrix4Elements,
} from './StoredChunkVisibilityTypes.js';
import { FrustumPlanes } from './FrustumPlanes.js';

/** Reuses its result and plane buffers across frames. */
export class FrustumStoredChunkVisibility {
  readonly visibleStoredChunkIndices: Uint32Array;
  visibleStoredChunkCount = 0;

  readonly #storedChunkCullingBounds: StoredChunkCullingBounds;
  readonly #frustumPlanes = new FrustumPlanes();

  constructor(storedChunkCullingBounds: StoredChunkCullingBounds) {
    this.#storedChunkCullingBounds = storedChunkCullingBounds;
    this.visibleStoredChunkIndices = new Uint32Array(
      storedChunkCullingBounds.storedChunkCount,
    );
  }

  /**
   * Updates the visible stored-chunk indices from a column-major
   * projection * view * model matrix and returns the visible count.
   */
  updateVisibleStoredChunks(
    clipFromModelMatrix: Matrix4Elements,
    depthRange: ClipSpaceDepthRange,
  ): number {
    this.#frustumPlanes.update(clipFromModelMatrix, depthRange);

    let visibleStoredChunkCount = 0;
    for (
      let storedChunkIndex = 0;
      storedChunkIndex < this.#storedChunkCullingBounds.storedChunkCount;
      storedChunkIndex += 1
    ) {
      if (!this.#frustumPlanes.intersectsBounds(
        this.#storedChunkCullingBounds.minimumMaximumCoordinates,
        storedChunkIndex * 6,
      )) continue;

      this.visibleStoredChunkIndices[visibleStoredChunkCount] = storedChunkIndex;
      visibleStoredChunkCount += 1;
    }
    this.visibleStoredChunkCount = visibleStoredChunkCount;
    return visibleStoredChunkCount;
  }
}
