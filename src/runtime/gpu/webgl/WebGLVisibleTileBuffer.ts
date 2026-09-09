import {
  DataTexture,
  RGBAIntegerFormat,
  UnsignedIntType,
  type WebGLRenderer,
} from 'three';

const VALUES_PER_TILE = 4;

/** Owns the shared RGBA32UI texture for grouped density tile records. */
export class WebGLVisibleTileBuffer {
  readonly data: Uint32Array;
  readonly texture: DataTexture;
  readonly textureWidth: number;
  readonly tileCapacity: number;
  visibleTileCount = 0;

  readonly #renderer: WebGLRenderer;

  constructor(renderer: WebGLRenderer, tileCapacity: number, name: string) {
    if (!Number.isInteger(tileCapacity) || tileCapacity < 1) {
      throw new Error('Visible tile capacity must be a positive integer.');
    }
    this.#renderer = renderer;
    this.tileCapacity = tileCapacity;
    this.textureWidth = Math.min(tileCapacity, renderer.capabilities.maxTextureSize);
    const textureHeight = Math.ceil(tileCapacity / this.textureWidth);
    if (textureHeight > renderer.capabilities.maxTextureSize) {
      throw new Error(
        `Visible tile texture size ${this.textureWidth}x${textureHeight} exceeds WebGL maximum ${renderer.capabilities.maxTextureSize}x${renderer.capabilities.maxTextureSize}.`,
      );
    }
    this.data = new Uint32Array(
      this.textureWidth * textureHeight * VALUES_PER_TILE,
    );
    this.texture = new DataTexture(
      this.data,
      this.textureWidth,
      textureHeight,
      RGBAIntegerFormat,
      UnsignedIntType,
    );
    this.texture.name = name;
    this.texture.needsUpdate = true;
    renderer.initTexture(this.texture);
  }

  update(tileRecords: Uint32Array, tileCount: number): void {
    if (!Number.isInteger(tileCount)
      || tileCount < 0
      || tileCount > this.tileCapacity
      || tileCount * VALUES_PER_TILE > tileRecords.length) {
      throw new Error(`Visible tile count ${tileCount} exceeds its source or buffer capacity.`);
    }
    this.data.set(tileRecords.subarray(0, tileCount * VALUES_PER_TILE));
    this.visibleTileCount = tileCount;
    if (tileCount > 0) {
      this.texture.needsUpdate = true;
      this.#renderer.initTexture(this.texture);
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}
