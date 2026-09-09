import {
  DataTexture,
  RedIntegerFormat,
  UnsignedIntType,
  type WebGLRenderer,
} from 'three';

/** Uploads the compact, static list of mask-active local Cell indices. */
export class WebGLActiveCellBuffer {
  readonly texture: DataTexture;
  readonly textureWidth: number;

  constructor(renderer: WebGLRenderer, activeCellIndices: Uint32Array, name: string) {
    const data = activeCellIndices.length > 0 ? activeCellIndices : Uint32Array.of(0);
    this.textureWidth = Math.min(data.length, renderer.capabilities.maxTextureSize);
    const textureHeight = Math.ceil(data.length / this.textureWidth);
    if (textureHeight > renderer.capabilities.maxTextureSize) {
      throw new Error(
        `Active Cell texture size ${this.textureWidth}x${textureHeight} exceeds WebGL maximum ${renderer.capabilities.maxTextureSize}x${renderer.capabilities.maxTextureSize}.`,
      );
    }
    const textureData = data.length === this.textureWidth * textureHeight
      ? data
      : createPaddedData(data, this.textureWidth * textureHeight);
    this.texture = new DataTexture(
      textureData,
      this.textureWidth,
      textureHeight,
      RedIntegerFormat,
      UnsignedIntType,
    );
    this.texture.name = name;
    this.texture.needsUpdate = true;
    renderer.initTexture(this.texture);
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function createPaddedData(source: Uint32Array, length: number): Uint32Array {
  const data = new Uint32Array(length);
  data.set(source);
  return data;
}
