import {
  DataTexture,
  RGBAIntegerFormat,
  UnsignedIntType,
  type WebGLRenderer,
} from 'three';

import {
  calculateWebGLDataTextureLayout,
} from '../../../../runtime/webgl-data-texture-layout/WebGLDataTextureLayout.js';
import { RENDER_TILE_RECORD_UINT32_COUNT } from '../DensitySelectionTypes.js';

/** Owns the mutable RGBA32UI texture containing visible render-tile records. */
export class WebGLVisibleRenderTileTexture {
  readonly renderTileRecordData: Uint32Array;
  readonly texture: DataTexture;
  readonly textureWidth: number;
  readonly renderTileCapacity: number;
  visibleRenderTileCount = 0;

  readonly #renderer: WebGLRenderer;

  constructor(renderer: WebGLRenderer, renderTileCapacity: number, name: string) {
    if (!Number.isInteger(renderTileCapacity) || renderTileCapacity < 1) {
      throw new Error('Visible render-tile capacity must be a positive integer.');
    }
    const layout = calculateWebGLDataTextureLayout(
      renderTileCapacity,
      renderer.capabilities.maxTextureSize,
      name,
    );
    this.#renderer = renderer;
    this.renderTileCapacity = renderTileCapacity;
    this.textureWidth = layout.width;
    this.renderTileRecordData = new Uint32Array(
      layout.texelCapacity * RENDER_TILE_RECORD_UINT32_COUNT,
    );
    this.texture = new DataTexture(
      this.renderTileRecordData,
      layout.width,
      layout.height,
      RGBAIntegerFormat,
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

  update(renderTileRecords: Uint32Array, visibleRenderTileCount: number): void {
    const usedValueCount = visibleRenderTileCount * RENDER_TILE_RECORD_UINT32_COUNT;
    if (!Number.isInteger(visibleRenderTileCount)
      || visibleRenderTileCount < 0
      || visibleRenderTileCount > this.renderTileCapacity
      || usedValueCount > renderTileRecords.length) {
      throw new Error(
        `Visible render-tile count ${visibleRenderTileCount} exceeds its source or texture capacity.`,
      );
    }

    let contentsChanged = false;
    for (let valueIndex = 0; valueIndex < usedValueCount; valueIndex += 1) {
      if (this.renderTileRecordData[valueIndex] !== renderTileRecords[valueIndex]) {
        contentsChanged = true;
        break;
      }
    }
    this.visibleRenderTileCount = visibleRenderTileCount;
    if (!contentsChanged) return;

    this.renderTileRecordData.set(renderTileRecords.subarray(0, usedValueCount));
    this.texture.needsUpdate = true;
    this.#renderer.initTexture(this.texture);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
