import type { VegetationRuntimeConfig } from '../src/index.js';

/** Small, application-neutral configuration for the standalone WebGL example. */
export const vegetationExampleConfig = {
  configVersion: 2,
  layers: [{
    layerId: 0,
    key: 'meadow-grass',
    enabled: true,
    patches: { ground: { enabled: false } },
    distribution: {
      anchorsPerCell: 4,
      elementsPerAnchor: 1,
      elementRadiusMeters: 0.02,
    },
    visibility: { maximumDistanceMeters: 100 },
    pattern: {
      patternCount: 4,
      rotatePerCell: true,
      reflectPerCell: true,
    },
    blade: {
      segments: 2,
      heightSampling: 'bilinear',
      heightMeters: { minimum: 0.35, maximum: 0.55 },
      widthMeters: { minimum: 0.04, maximum: 0.08 },
      topWidthRatio: 0.35,
      maximumTiltDegrees: 25,
      cameraFacing: { startsAtMeters: 30, reachesFullAtMeters: 80 },
    },
    bladeThicknessDistanceScaling: {
      defaultScale: 1,
      maximumScale: 1.5,
      startsIncreasingAtMeters: 30,
      reachesMaximumAtMeters: 80,
      curveStrength: 1,
    },
    colors: {
      bottomColors: ['#3f7d35'],
      topColors: ['#67ad4d', '#78bb57'],
      verticalColorTransition: {
        startsAtBladeRatio: 0.05,
        endsAtBladeRatio: 0.9,
      },
      distanceColorTransition: {
        farTint: '#8fbd70',
        startsAtMeters: 30,
        endsAtMeters: 90,
        curveStrength: 1,
      },
    },
    lighting: { directLightWeight: 0.8 },
    shadows: { receive: true },
    density: {
      renderTileSizeCells: 16,
      activeCells: [
        { distanceMeters: 0, ratio: 1 },
        { distanceMeters: 60, ratio: 0.5 },
        { distanceMeters: 100, ratio: 0 },
      ],
      activeAnchors: [
        { distanceMeters: 0, ratio: 1 },
        { distanceMeters: 60, ratio: 0.5 },
        { distanceMeters: 100, ratio: 0 },
      ],
      activeElements: [
        { distanceMeters: 0, ratio: 1 },
        { distanceMeters: 100, ratio: 1 },
      ],
    },
  }],
} as const satisfies VegetationRuntimeConfig;
