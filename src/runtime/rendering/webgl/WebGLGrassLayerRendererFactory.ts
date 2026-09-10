import { createThreeSceneLightingAdapter } from '../../adapters/three/ThreeSceneLightingAdapter.js';
import type { WebGLGrassGroundPatchSurface } from '../../profiles/grass/rendering/webgl/WebGLGrassGroundPatchSurface.js';
import { WebGLGrassView } from './WebGLGrassView.js';
import type { WebGLVegetationLightingAdapter } from './WebGLVegetationLightingAdapter.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererContext,
  WebGLVegetationLayerRendererFactory,
} from './WebGLVegetationLayerRenderer.js';

export type WebGLGrassLayerRendererFactoryOptions = Readonly<{
  lighting?: WebGLVegetationLightingAdapter;
  groundPatchSurface?: WebGLGrassGroundPatchSurface;
}>;

/** Built-in WebGL renderer module for the opinionated Grass profile. */
export class WebGLGrassLayerRendererFactory implements WebGLVegetationLayerRendererFactory {
  readonly profileType = 'grass';
  readonly #lighting: WebGLVegetationLightingAdapter;
  readonly #groundPatchSurface: WebGLGrassGroundPatchSurface | undefined;

  constructor(options: WebGLGrassLayerRendererFactoryOptions = {}) {
    this.#lighting = options.lighting ?? createThreeSceneLightingAdapter();
    this.#groundPatchSurface = options.groundPatchSurface;
  }

  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer {
    return new WebGLGrassView(
      context.adapter,
      context.layer.layerId,
      context.activeCells,
      this.#lighting,
      this.#groundPatchSurface,
    );
  }
}

export function createWebGLGrassLayerRenderer(
  options: WebGLGrassLayerRendererFactoryOptions = {},
): WebGLGrassLayerRendererFactory {
  return new WebGLGrassLayerRendererFactory(options);
}
