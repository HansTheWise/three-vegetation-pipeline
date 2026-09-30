import type { WebGLRenderer } from 'three';

import type { PreparedVegetationDataset } from '../dataset-preparation/dataset-construction/PreparedVegetationDataset.js';
import type { VegetationFrameState } from '../VegetationRuntimeManager.js';
import { FrustumStoredChunkVisibility } from './frustum-visibility-evaluation/FrustumStoredChunkVisibility.js';
import { createDatasetStoredChunkCullingBounds } from './chunk-culling-bounds/StoredChunkCullingBounds.js';
import { WebGLVisibleStoredChunkTexture } from './WebGLVisibleStoredChunkTexture.js';

/** Owns evaluation and GPU publication of the visible stored-chunk selection. */
export class ChunkVisibilityManager {
  readonly visibleStoredChunkTexture: WebGLVisibleStoredChunkTexture;

  readonly #storedChunkVisibility: FrustumStoredChunkVisibility;

  constructor(parameters: ChunkVisibilityManagerParameters) {
    const storedChunkCullingBounds = createDatasetStoredChunkCullingBounds(
      parameters.vegetationDataset,
    );
    this.#storedChunkVisibility = new FrustumStoredChunkVisibility(
      storedChunkCullingBounds,
    );
    this.visibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(
      parameters.renderer,
      parameters.vegetationDataset.file.header.storedChunkCount,
    );
  }

  updateVisibleStoredChunks(frameState: VegetationFrameState): number {
    const visibleStoredChunkCount = this.#storedChunkVisibility.updateVisibleStoredChunks(
      frameState.clipFromModelMatrix,
      frameState.clipSpaceDepthRange,
    );
    this.visibleStoredChunkTexture.update(
      this.#storedChunkVisibility.visibleStoredChunkIndices,
      visibleStoredChunkCount,
    );
    return visibleStoredChunkCount;
  }

  dispose(): void {
    this.visibleStoredChunkTexture.dispose();
  }
}

export type ChunkVisibilityManagerParameters = Readonly<{
  renderer: WebGLRenderer;
  vegetationDataset: PreparedVegetationDataset;
}>;
