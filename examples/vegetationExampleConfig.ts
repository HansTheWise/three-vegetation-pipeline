import {
  createGrassLayerConfig,
  type VegetationRuntimeConfig,
} from '../src/index.js';

/** Small, application-neutral configuration for the standalone WebGL example. */
export const vegetationExampleConfig = {
  configVersion: 3,
  layers: [createGrassLayerConfig({
    layerId: 0,
    key: 'meadow-grass',
  })],
} satisfies VegetationRuntimeConfig;
