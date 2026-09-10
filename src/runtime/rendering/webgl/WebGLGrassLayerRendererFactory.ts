import { WebGLGrassView } from './WebGLGrassView.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererContext,
  WebGLVegetationLayerRendererFactory,
} from './WebGLVegetationLayerRenderer.js';

/** Built-in WebGL renderer module for the opinionated Grass profile. */
export class WebGLGrassLayerRendererFactory implements WebGLVegetationLayerRendererFactory {
  readonly profileType = 'grass';

  create(context: WebGLVegetationLayerRendererContext): WebGLVegetationLayerRenderer {
    return new WebGLGrassView(
      context.adapter,
      context.layer.layerId,
      context.activeCells,
    );
  }
}
