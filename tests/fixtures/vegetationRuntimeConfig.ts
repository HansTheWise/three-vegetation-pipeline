import {
  createGrassLayerConfig,
  type VegetationRuntimeConfig,
} from '../../src/index.js';

/** Neutral runtime fixture shared by pipeline unit tests and examples. */
export const vegetationRuntimeConfig = {
  configVersion: 3,
  layers: [createGrassLayerConfig({
    layerId: 0,
    key: 'meadow-grass',
    enabled: true,
    patches: {
      ground: { enabled: false },
    },
    distribution: {
      anchorsPerCell: 4,
      elementsPerAnchor: 1,
      elementRadiusMeters: 0.02,
    },
    visibility: {
      maximumDistanceMeters: 500,
    },
    pattern: {
      patternCount: 4,
      rotatePerCell: true,
      reflectPerCell: true,
    },
    grass: {
      blade: {
        segments: 2,
        heightSampling: 'bilinear',
        heightMeters: { minimum: 0.4, maximum: 0.5 },
        widthMeters: { minimum: 0.05, maximum: 0.08 },
        topWidthRatio: 0.5,
        maximumTiltDegrees: 35,
        cameraFacing: { startsAtMeters: 80, reachesFullAtMeters: 140 },
      },
      bladeThicknessDistanceScaling: {
        defaultScale: 1,
        maximumScale: 2,
        startsIncreasingAtMeters: 50,
        reachesMaximumAtMeters: 500,
        curveStrength: 2,
      },
      colors: {
        bottomColors: ['#274203'],
        topColors: ['#355d0b', '#3d6414', '#476d1f'],
        verticalColorTransition: {
          startsAtBladeRatio: 0.01,
          endsAtBladeRatio: 0.99,
        },
        distanceColorTransition: {
          farTint: '#fefefe',
          startsAtMeters: 10,
          endsAtMeters: 500,
          curveStrength: 10,
        },
      },
    },
    lighting: {
      directLightWeight: 0.35,
    },
    shadows: {
      cast: false,
      receive: true,
    },
    density: {
      renderTileSizeCells: 32,
      activeCells: [
        { distanceMeters: 0, ratio: 1 },
        { distanceMeters: 126, ratio: 0.568 },
        { distanceMeters: 220, ratio: 3 / 64 },
        { distanceMeters: 500, ratio: 0 },
      ],
      activeAnchors: [
        { distanceMeters: 0, ratio: 1 },
        { distanceMeters: 127, ratio: 0.345 },
        { distanceMeters: 220, ratio: 1 / 4 },
        { distanceMeters: 500, ratio: 0 },
      ],
      activeElements: [
        { distanceMeters: 0, ratio: 1 },
        { distanceMeters: 220, ratio: 1 },
        { distanceMeters: 500, ratio: 0 },
      ],
    },
  })],
} satisfies VegetationRuntimeConfig;
