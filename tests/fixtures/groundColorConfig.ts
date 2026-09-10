import { vegetationRuntimeConfig } from './vegetationRuntimeConfig.js';
import type { GrassRuntimeLayerConfig, VegetationRuntimeConfig } from '../../src/index.js';

const layer = vegetationRuntimeConfig.layers[0]!;
export const groundColorConfig = {
  ...vegetationRuntimeConfig,
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
    lighting: {
      ...layer.lighting,
      distanceTransition: {
        directLightWeight: 1,
        indirectLightWeight: 1,
        bottom: { startsAtMeters: 30, endsAtMeters: 120, curveStrength: 0 },
        top: { startsAtMeters: 60, endsAtMeters: 180, curveStrength: 2 },
      },
    },
    renderProfile: {
      ...layer.renderProfile,
      colors: {
        ...layer.renderProfile.colors,
        distanceColorTransition: {
          target: 'ground',
          bottom: { startsAtMeters: 30, endsAtMeters: 120, curveStrength: 0 },
          top: { startsAtMeters: 60, endsAtMeters: 180, curveStrength: 2 },
        },
      },
    },
  }],
} as const satisfies VegetationRuntimeConfig<GrassRuntimeLayerConfig>;
