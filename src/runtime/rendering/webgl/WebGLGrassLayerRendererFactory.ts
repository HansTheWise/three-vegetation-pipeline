import { createThreeSceneLightingAdapter } from '../../adapters/three/ThreeSceneLightingAdapter.js';
import { WebGLGrassView } from './WebGLGrassView.js';
import type { WebGLVegetationLightingAdapter } from './WebGLVegetationLightingAdapter.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererContext,
  WebGLVegetationLayerRendererFactory,
} from './WebGLVegetationLayerRenderer.js';

export type WebGLGrassLayerRendererFactoryOptions = Readonly<{
  lighting?: WebGLVegetationLightingAdapter;
}>;

/** Built-in WebGL renderer module for the opinionated Grass profile. */
export class WebGLGrassLayerRendererFactory implements WebGLVegetationLayerRendererFactory {
  readonly profileType = 'grass';
  readonly #lighting: WebGLVegetationLightingAdapter;

  constructor(options: WebGLGrassLayerRendererFactoryOptions = {}) {
    this.#lighting = options.lighting ?? createThreeSceneLightingAdapter();
  }

  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer {
    return new WebGLGrassView(
      context.adapter,
      context.layer.layerId,
      context.activeCells,
      this.#lighting,
    );
  }
}

export function createWebGLGrassLayerRenderer(
  options: WebGLGrassLayerRendererFactoryOptions = {},
): WebGLGrassLayerRendererFactory {
  return new WebGLGrassLayerRendererFactory(options);
}
