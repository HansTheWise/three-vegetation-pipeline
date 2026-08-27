import {
  DataTexture,
  RedIntegerFormat,
  UnsignedIntType,
  type WebGLRenderer,
} from 'three';

/** Owns the fixed-capacity GPU resource updated with visible chunks each frame. */
export class WebGLVisibleChunkBuffer {
  readonly data: Uint32Array;
  readonly texture: DataTexture;
  visibleChunkCount = 0;

  readonly #renderer: WebGLRenderer;

  constructor(renderer: WebGLRenderer, chunkCapacity: number) {
    if (chunkCapacity > renderer.capabilities.maxTextureSize) {
      throw new Error(
        `Visible chunk texture width ${chunkCapacity} exceeds WebGL maximum ${renderer.capabilities.maxTextureSize}.`,
      );
    }

    this.#renderer = renderer;
    this.data = new Uint32Array(chunkCapacity);
    this.texture = new DataTexture(
      this.data,
      chunkCapacity,
      1,
      RedIntegerFormat,
      UnsignedIntType,
    );
    this.texture.name = 'vegetation/visible-chunk-indices';
    this.texture.needsUpdate = true;
    renderer.initTexture(this.texture);
  }

  update(visibleChunkIndices: Uint32Array, visibleChunkCount: number): void {
    if (!Number.isInteger(visibleChunkCount)
      || visibleChunkCount < 0
      || visibleChunkCount > this.data.length
      || visibleChunkCount > visibleChunkIndices.length) {
      throw new Error(
        `visibleChunkCount ${visibleChunkCount} must fit both the source array and buffer capacity ${this.data.length}.`,
      );
    }

    for (let index = 0; index < visibleChunkCount; index += 1) {
      this.data[index] = visibleChunkIndices[index]!;
    }
    this.visibleChunkCount = visibleChunkCount;

    if (visibleChunkCount > 0) {
      this.texture.needsUpdate = true;
      this.#renderer.initTexture(this.texture);
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}
