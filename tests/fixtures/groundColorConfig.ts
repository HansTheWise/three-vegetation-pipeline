import { icakaVegetationRuntimeConfig } from '../../config/icaka.vegetation.runtime.config.js';
import type { VegetationRuntimeConfig } from '../../src/index.js';

const layer = icakaVegetationRuntimeConfig.layers[0]!;
export const groundColorConfig = {
  ...icakaVegetationRuntimeConfig,
  layers: [{
    ...layer,
    patches: {
      ...layer.patches,
      ground: {
        enabled: true,
        seed: 0,
        radiusMeters: { minimum: 8, maximum: 20 },
        targetCoverage: 0.86,
        allowMerging: true,
        edgeFalloffMeters: 8,
        shapeDistortion: 0.8,
        colors: { baseColor: '#67b846', brightnessVariation: 0.1 },
      },
    },
    colors: {
      ...layer.colors,
      distanceColorTransition: {
        target: 'ground',
        bottom: { startsAtMeters: 30, endsAtMeters: 120, curveStrength: 0 },
        top: { startsAtMeters: 60, endsAtMeters: 180, curveStrength: 2 },
      },
    },
  }],
} as const satisfies VegetationRuntimeConfig;
