import type { VegetationRuntimeConfig } from '../src/runtime/config/types.js';

/**
 * Initial I-CAKA frontend values. This file contains data only. The runtime
 * pipeline decides which visibility, pattern, distance, geometry and shader
 * modules consume the individual sections.
 */
export const icakaVegetationRuntimeConfig = {
  configVersion: 2,
  assetUrl: '/models/campus/campus.veg',

  layers: [
    {
      /** Matches the stable campus-grass layer ID stored in campus.veg. */
      layerId: 0,
      key: 'campus-grass',
      enabled: true,
      patches: {
        ground: { enabled: false },
      },

      // Grundverteilung: maximal 4 einzeln verteilte Halme pro aktiver Cell.
      distribution: {
        anchorsPerCell: 4,
        elementsPerAnchor: 1,
        elementRadiusMeters: 0.02, // Büschelradius; Wurzeln bleiben in der Cell.
      },

      visibility: {
        maximumDistanceMeters: 500,
      },

      pattern: {
        patternCount: 4,
        rotatePerCell: true,
        reflectPerCell: true,
      },

      blade: {
        segments: 2,
        heightSampling: 'bilinear',
        heightMeters: {
          minimum: 0.4,
          maximum: 0.5,
        },
        widthMeters: {
          minimum: 0.05,
          maximum: 0.08,
        },
        topWidthRatio: 0.5,
        maximumTiltDegrees: 35,
        cameraFacing: {
          startsAtMeters: 80,
          reachesFullAtMeters: 140,
        },
      },

      bladeThicknessDistanceScaling: {
        defaultScale: 1,
        maximumScale: 2,
        startsIncreasingAtMeters: 50,
        reachesMaximumAtMeters: 500,
        curveStrength: 2,
      },

      colors: {
        bottomColors: [
          '#274203',
        ],
        topColors: [
          '#355d0b',
          '#3d6414',
          '#476d1f',
        ],
        verticalColorTransition: {
          startsAtBladeRatio: 0.01,
          endsAtBladeRatio: 0.99,
        },
        distanceColorTransition: {
          /** Near grass keeps its palette; distance approaches this tint. */
          farTint: '#fefefe',
          startsAtMeters: 10,
          endsAtMeters: 500,
          curveStrength: 10,
        },
      },

      lighting: {
        directLightWeight: 0.35,
      },

      shadows: {
        receive: true,
      },

      // Kontinuierliche Tile-Dichte; die Runtime verteilt ganzzahlige Budgets
      // stabil über maskenaktive Cells, Anchors und Elements.
      density: {
        renderTileSizeCells: 32, // 8 m pro Tile bei aktuellen 0.25-m-Cells.
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
    },
  ],
} as const satisfies VegetationRuntimeConfig;

export default icakaVegetationRuntimeConfig;
