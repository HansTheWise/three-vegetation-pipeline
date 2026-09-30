import {
  createGrassLayerConfig,
  type VegetationRuntimeConfig,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

/** Small, application-neutral configuration for the standalone WebGL example. */
export const vegetationExampleConfig = {
  configVersion: 3,
  layers: [createGrassLayerConfig({
    vegetationLayerId: 0,
    vegetationLayerKey: 'meadow-grass',
  })],
} satisfies VegetationRuntimeConfig;
