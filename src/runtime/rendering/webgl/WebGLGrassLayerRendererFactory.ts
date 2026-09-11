import { createThreeSceneLightingAdapter } from '../../adapters/three/ThreeSceneLightingAdapter.js';
import type { VegetationRuntimeLayer } from '../../dataset/types.js';
import {
  grassLayerPreparation,
  requireGrassRuntimeLayer,
} from '../../profiles/grass/GrassLayerPreparation.js';
import type { WebGLGrassGroundPatchSurface } from '../../profiles/grass/rendering/webgl/WebGLGrassGroundPatchSurface.js';
import { WebGLGrassView } from './WebGLGrassView.js';
import type { WebGLVegetationLightingAdapter } from './WebGLVegetationLightingAdapter.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererContext,
  WebGLVegetationLayerRendererFactory,
} from './WebGLVegetationLayerRenderer.js';
import type { WebGLVegetationLayerModule } from './WebGLVegetationLayerModule.js';

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

  validateLayer(layer: VegetationRuntimeLayer): void {
    requireGrassRuntimeLayer(layer);
  }

  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer {
    return new WebGLGrassView(
      context.adapter,
      context.layer.layerId,
      undefined,
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

/** Complete opinionated Grass module for preparation and WebGL rendering. */
export function createWebGLGrassLayerModule(
  options: WebGLGrassLayerRendererFactoryOptions = {},
): WebGLVegetationLayerModule {
  const renderer = new WebGLGrassLayerRendererFactory(options);
  return {
    profileType: 'grass',
    validateConfig: grassLayerPreparation.validateConfig,
    prepare: grassLayerPreparation.prepare,
    collectTransferBuffers: grassLayerPreparation.collectTransferBuffers,
    validateLayer: (layer) => renderer.validateLayer(layer),
    create: (context) => renderer.create(context),
  };
}
