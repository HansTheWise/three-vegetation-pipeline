import type { VegetationExtractionConfig } from '../src/config/types.js';
import type { VegWriterConfig } from '../src/writer/types.js';

/**
 * Draft configuration for the I-CAKA vegetation pipeline.
 *
 * This file defines the decisions shared by the extractor and the frontend.
 * Binary serialization is added separately by the future .veg writer.
 */
export const icakaVegetationConfig = {
  /** Version of this configuration shape, not the binary .veg file version. */
  configVersion: 1,

  coordinateSystem: {
    /** All extracted data is stored relative to the GLB root object. */
    space: 'model-local',
    upAxis: 'z',
    horizontalAxes: ['x', 'y'],
    unitsPerMeter: 1,
  },

  source: {
    format: 'glb',
    reader: 'three-gltf-loader',

    /** Hidden objects do not contribute to height or vegetation data. */
    includeInvisibleObjects: false,

    /**
     * Geometry used to calculate terrain height. This is deliberately
     * independent from the individual vegetation layer selectors.
     *
     * The current campus GLB contains the historical I-CAKA name "surfice";
     * "surface" remains an accepted spelling for future model exports.
     */
    heightSurfaceSelector: {
      any: [
        {
          type: 'mesh-name',
          values: ['surfice', 'surface'],
          caseSensitive: false,
        },
      ],
    },
  },

  extraction: {
    seed: {
      /**
       * "generated": The offline compiler generates the seed once and stores
       * it in the .veg file.
       * "manual": The compiler uses manualValue exactly as configured.
       */
      mode: 'generated',

      /** Used only when mode is "manual". Zero is a valid manual seed. */
      manualValue: 0,
    },

    grid: {
      strategy: 'fixed-world-size',
      chunkSize: 32,

      /**
       * The grid starts at the height-surface bounds, rounded down to a full
       * chunk boundary. An explicit origin can be added if I-CAKA needs one.
       */
      origin: {
        mode: 'snap-to-height-surface-bounds',
      },

      boundsSource: 'height-surfaces',
      includeEmptyChunks: false,
    },

    heightMap: {
      /** Number of sample points on each chunk axis. */
      resolution: 64,

      /**
       * Samples include all four chunk borders. Border samples are duplicated
       * in neighbouring chunks so each chunk can be sampled independently.
       */
      samplePlacement: 'include-chunk-borders',
    },

    vegetationMask: {
      /**
       * A cell is enabled when a selected triangle overlaps it. This preserves
       * narrow vegetation areas. Boundary accuracy is controlled by resolution.
       */
      cellActivation: 'triangle-overlap',

      /**
       * More than one layer may enable the same cell, for example grass and
       * flowers using separate frontend render profiles.
       */
      allowLayerOverlap: true,
    },

    /**
     * A surface selector describes source geometry. A vegetation layer is the
     * stable output identity and owns one mask in the VegetationDataset.
     *
     * Numeric IDs are stored in .veg and must never be silently reassigned.
     * Keys are used by application configuration and diagnostics.
     */
    vegetationLayers: [
      {
        id: 0,
        key: 'campus-grass',
        displayName: 'Campus grass',
        enabled: true,
        /** Number of mask cells on each chunk axis for this layer. */
        maskResolution: 128,

        surfaceSelector: {
          all: [
            {
              type: 'mesh-name',
              values: ['surfice', 'surface'],
              caseSensitive: false,
            },
            {
              /** Material name verified against the current campus GLB. */
              type: 'material-name',
              values: ['map_grun'],
              caseSensitive: false,
            },
          ],
        },

        filters: {
          /** Excludes walls and very steep terrain from the vegetation mask. */
          maximumSlopeDegrees: 60,
        },
      },
    ],
  },

  /**
   * Frontend bindings are deliberately references, not shader code inside the
   * generated asset. The .veg layer ID stays stable while shader, placement,
   * LOD and appearance profiles remain independently replaceable.
   */
  frontend: {
    layerBindings: {
      'campus-grass': {
        placementProfile: 'campus-grass',
        lodProfile: 'campus-grass',
        shaderProfile: 'campus-grass',
        appearanceProfile: 'campus-grass',
      },
    },
  },

  output: {
    format: 'veg',

    /** The concrete binary schema is defined by VegCodec, not this config. */
    fileVersion: 1,
    byteOrder: 'little-endian',
    /** Unsigned quantized value width used for every height sample. */
    heightValueBits: 16,
  },

  validation: {
    noHeightSurfaces: 'error',
    noVegetationLayers: 'error',
    emptyEnabledLayer: 'error',
    nonFiniteVertexPositions: 'error',
    unsupportedGeometry: 'error',
  },
} as const satisfies VegetationExtractionConfig & {
  output: VegWriterConfig & Record<string, unknown>;
} & Record<string, unknown>;

export default icakaVegetationConfig;
