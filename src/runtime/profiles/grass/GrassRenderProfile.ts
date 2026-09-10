import type {
  GrassRenderProfileConfig,
  GrassRuntimeLayerConfig,
  VegetationRuntimeLayerConfig,
} from '../../config/types.js';

export function requireGrassRenderProfile(
  layer: VegetationRuntimeLayerConfig,
): GrassRenderProfileConfig {
  if (layer.renderProfile.type !== 'grass') {
    throw new Error(
      `Runtime layer "${layer.key}" uses render profile "${layer.renderProfile.type}", not "grass".`,
    );
  }
  return layer.renderProfile as GrassRenderProfileConfig;
}

export function requireGrassRuntimeLayerConfig(
  layer: VegetationRuntimeLayerConfig,
): GrassRuntimeLayerConfig {
  requireGrassRenderProfile(layer);
  return layer as GrassRuntimeLayerConfig;
}
