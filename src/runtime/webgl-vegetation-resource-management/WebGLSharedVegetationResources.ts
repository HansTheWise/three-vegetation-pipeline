import type { WebGLRenderer } from 'three';

import type { VegetationRuntimeDataset } from '../runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import { WebGLSharedVegFileTextures } from './shared-vegfile-textures/WebGLSharedVegFileTextures.js';
import { WebGLVisibleStoredChunkTexture } from './visible-stored-chunk-texture/WebGLVisibleStoredChunkTexture.js';

/** Owns the dataset and WebGL resources shared by all initialized layers. */
export class WebGLSharedVegetationResources {
  readonly renderer: WebGLRenderer;
  readonly dataset: VegetationRuntimeDataset;
  readonly vegFileTextures: WebGLSharedVegFileTextures;
  readonly visibleStoredChunkTexture: WebGLVisibleStoredChunkTexture;

  constructor(renderer: WebGLRenderer, dataset: VegetationRuntimeDataset) {
    this.renderer = renderer;
    this.dataset = dataset;
    let vegFileTextures: WebGLSharedVegFileTextures | undefined;
    try {
      vegFileTextures = new WebGLSharedVegFileTextures(renderer, dataset);
      this.visibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(
        renderer,
        dataset.file.header.storedChunkCount,
      );
    } catch (error) {
      vegFileTextures?.dispose();
      throw error;
    }
    this.vegFileTextures = vegFileTextures;
  }

  dispose(): void {
    this.visibleStoredChunkTexture.dispose();
    this.vegFileTextures.dispose();
  }
}
