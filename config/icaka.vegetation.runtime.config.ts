import type { VegetationRuntimeConfig } from '../src/runtime/config/types.js';

/**
 * Initial I-CAKA frontend values. This file contains data only. The runtime
 * pipeline decides which visibility, pattern, distance, geometry and shader
 * modules consume the individual sections.
 */
export const icakaVegetationRuntimeConfig = {
  configVersion: 1,
  assetUrl: '/models/campus/campus.veg',

  layers: [
    {
      /** Matches the stable campus-grass layer ID stored in campus.veg. */
      layerId: 0,
      key: 'campus-grass',
      enabled: true,

      visibility: {
        maximumDistanceMeters: 500,
      },

      lod: {
        /** 32 Cells equal an 8 m render tile for the current 0.25 m Cells. */
        renderTileSizeCells: 32,
        /**
         * Progressive stable prefixes. Density first falls through the four
         * Anchors, then through Cells. Far levels use the four-vertex strip.
         */
        levels: [
          {
            cellCoverageRatio: 1,
            anchorCount: 4,
            elementCount: 1,
            bladeSegments: 2,
            heightSampling: 'bilinear',
          },
          {
            cellCoverageRatio: 1,
            anchorCount: 3,
            elementCount: 1,
            bladeSegments: 2,
            heightSampling: 'bilinear',
          },
          {
            cellCoverageRatio: 1,
            anchorCount: 2,
            elementCount: 1,
            bladeSegments: 2,
            heightSampling: 'bilinear',
          },
          {
            cellCoverageRatio: 1,
            anchorCount: 1,
            elementCount: 1,
            bladeSegments: 2,
            heightSampling: 'bilinear',
          },
          {
            cellCoverageRatio: 1 / 2,
            anchorCount: 1,
            elementCount: 1,
            bladeSegments: 1,
            heightSampling: 'diagonal-average',
          },
          {
            cellCoverageRatio: 1 / 4,
            anchorCount: 1,
            elementCount: 1,
            bladeSegments: 1,
            heightSampling: 'diagonal-average',
          },
          {
            cellCoverageRatio: 1 / 8,
            anchorCount: 1,
            elementCount: 1,
            bladeSegments: 1,
            heightSampling: 'diagonal-average',
          },
          {
            cellCoverageRatio: 1 / 64,
            anchorCount: 1,
            elementCount: 1,
            bladeSegments: 1,
            heightSampling: 'diagonal-average',
          },
        ],
      },

      pattern: {
        patternCount: 4,
        /** Four progressive Anchors form the maximum near-camera density. */
        anchorsPerCell: 4,
        rotatePerCell: true,
        reflectPerCell: true,
      },

      blade: {
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
      },

      bladeCount: {
        /** One blade per Anchor is sufficient at the current Cell size. */
        maximumPerAnchor: 1,
        /** Keeps the blade root close to its Anchor. */
        maximumOffsetMeters: 0.02,
        startsDecreasingAtMeters: 10,
        reachesZeroAtMeters: 500,
        curveStrength: 10,
        growthTransitionDistanceMeters: 12,
        /** New LOD candidates enter at full height with only their upper quarter visible. */
        lodTransitionStartVisibleRatio: 0.25,
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
        normalUpBias: 0.95,
      },

      cameraFacing: {
        topViewStartsAtDegrees: 35,
        topViewFullyAppliedAtDegrees: 70,
        maximumTiltDegrees: 35,
      },

      shadows: {
        receive: true,
        /** Grass receives scene shadows but never renders into shadow maps. */
        cast: false,
        castUntilMeters: 40,
      },

      wind: {
        strength: 1,
        speed: 1,
        spatialFrequency: 1,
        gustStrength: 0.5,
        gustFrequency: 0.2,
        variation: 0.25,
      },
    },
  ],
} as const satisfies VegetationRuntimeConfig;

export default icakaVegetationRuntimeConfig;
