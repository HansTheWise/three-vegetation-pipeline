import {
  DataTexture,
  RedIntegerFormat,
  UnsignedIntType,
  type WebGLRenderer,
} from 'three';

import {
  calculateWebGLDataTextureLayout,
  padWebGLDataTextureArray,
} from '../../../../runtime/webgl-vegetation-resource-management/data-texture-layout/WebGLDataTextureLayout.js';

/** Owns the immutable texture of mask-active local Cell indices. */
export class WebGLActiveCellIndexTexture {
  readonly texture: DataTexture;
  readonly textureWidth: number;

  constructor(renderer: WebGLRenderer, activeCellIndices: Uint32Array, name: string) {
    const activeCellIndexCount = Math.max(1, activeCellIndices.length);
    const layout = calculateWebGLDataTextureLayout(
      activeCellIndexCount,
      renderer.capabilities.maxTextureSize,
      name,
    );
    const textureData = padWebGLDataTextureArray(
      activeCellIndices,
      layout.texelCapacity,
    );
    this.textureWidth = layout.width;
    this.texture = new DataTexture(
      textureData,
      layout.width,
      layout.height,
      RedIntegerFormat,
      UnsignedIntType,
    );
    this.texture.name = name;
    this.texture.needsUpdate = true;
    try {
      renderer.initTexture(this.texture);
    } catch (error) {
      this.texture.dispose();
      throw error;
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}
