import type { WebGLRenderer } from 'three';

import type { VegetationRuntimeDataset } from '../../dataset/types.js';
import { WebGLStaticVegetationResources } from './WebGLStaticVegetationResources.js';
import { WebGLVisibleChunkBuffer } from './WebGLVisibleChunkBuffer.js';

/** Owns all WebGL data resources for one parsed vegetation asset. */
export class WebGLVegetationAdapter {
  readonly renderer: WebGLRenderer;
  readonly dataset: VegetationRuntimeDataset;
  readonly staticResources: WebGLStaticVegetationResources;
  readonly visibleChunkBuffer: WebGLVisibleChunkBuffer;

  constructor(
    renderer: WebGLRenderer,
    dataset: VegetationRuntimeDataset,
  ) {
    this.renderer = renderer;
    this.dataset = dataset;
    let staticResources: WebGLStaticVegetationResources | undefined;
    try {
      staticResources = new WebGLStaticVegetationResources(renderer, dataset);
      this.visibleChunkBuffer = new WebGLVisibleChunkBuffer(
        renderer,
        dataset.file.header.storedChunkCount,
      );
    } catch (error) {
      staticResources?.dispose();
      throw error;
    }
    this.staticResources = staticResources;
  }

  updateVisibleChunks(
    visibleChunkIndices: Uint32Array,
    visibleChunkCount: number,
  ): void {
    this.visibleChunkBuffer.update(visibleChunkIndices, visibleChunkCount);
  }

  dispose(): void {
    this.visibleChunkBuffer.dispose();
    this.staticResources.dispose();
  }
}
