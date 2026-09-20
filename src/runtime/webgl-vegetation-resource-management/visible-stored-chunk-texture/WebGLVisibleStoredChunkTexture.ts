import {
  DataTexture,
  RedIntegerFormat,
  UnsignedIntType,
  type WebGLRenderer,
} from 'three';
import { calculateWebGLDataTextureLayout } from '../data-texture-layout/WebGLDataTextureLayout.js';

/** Owns the fixed-capacity texture containing visible stored chunk indices. */
export class WebGLVisibleStoredChunkTexture {
  readonly storedChunkIndexData: Uint32Array;
  readonly texture: DataTexture;
  readonly textureWidth: number;
  readonly storedChunkCapacity: number;
  visibleStoredChunkCount = 0;
  selectionRevision = 0;

  readonly #renderer: WebGLRenderer;

  constructor(renderer: WebGLRenderer, storedChunkCapacity: number) {
    const textureName = 'vegetation/visible-stored-chunk-indices';
    const layout = calculateWebGLDataTextureLayout(
      storedChunkCapacity,
      renderer.capabilities.maxTextureSize,
      textureName,
    );
    this.#renderer = renderer;
    this.storedChunkCapacity = storedChunkCapacity;
    this.textureWidth = layout.width;
    this.storedChunkIndexData = new Uint32Array(layout.texelCapacity);
    this.texture = new DataTexture(
      this.storedChunkIndexData,
      layout.width,
      layout.height,
      RedIntegerFormat,
      UnsignedIntType,
    );
    this.texture.name = textureName;
    this.texture.needsUpdate = true;
    try {
      renderer.initTexture(this.texture);
    } catch (error) {
      this.texture.dispose();
      throw error;
    }
  }

  update(
    visibleStoredChunkIndices: Uint32Array,
    visibleStoredChunkCount: number,
  ): void {
    if (!Number.isInteger(visibleStoredChunkCount)
      || visibleStoredChunkCount < 0
      || visibleStoredChunkCount > this.storedChunkCapacity
      || visibleStoredChunkCount > visibleStoredChunkIndices.length) {
      throw new Error(
        `visibleStoredChunkCount ${visibleStoredChunkCount} must fit both the source array and texture capacity ${this.storedChunkCapacity}.`,
      );
    }

    const countChanged = this.visibleStoredChunkCount !== visibleStoredChunkCount;
    let contentsChanged = false;
    for (let index = 0; index < visibleStoredChunkCount; index += 1) {
      const storedChunkIndex = visibleStoredChunkIndices[index]!;
      if (this.storedChunkIndexData[index] === storedChunkIndex) continue;
      this.storedChunkIndexData[index] = storedChunkIndex;
      contentsChanged = true;
    }
    this.visibleStoredChunkCount = visibleStoredChunkCount;
    if (countChanged || contentsChanged) this.selectionRevision += 1;

    // The draw count selects the valid prefix, so a count-only change needs no upload.
    if (contentsChanged) {
      this.texture.needsUpdate = true;
      this.#renderer.initTexture(this.texture);
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}
