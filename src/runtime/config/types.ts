import type { PatchConfig } from '../patches/types.js';

export type HexColor = `#${string}`;

export type NumericRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

export type VegetationHeightSampling = 'bilinear' | 'diagonal-average';

export type VegetationColorDistanceCurve = Readonly<{
  startsAtMeters: number;
  endsAtMeters: number;
  curveStrength: number;
}>;

export type VegetationDensityCurvePoint = Readonly<{
  distanceMeters: number;
  ratio: number;
}>;

export type VegetationPatternConfig = Readonly<{
  patternCount: number;
  anchorsPerCell: number;
  rotatePerCell: boolean;
  reflectPerCell: boolean;
}>;

export type VegetationRuntimeLayerConfig = Readonly<{
  /** Stable layer ID read from the .veg layer metadata. */
  layerId: number;
  key: string;
  enabled: boolean;
  patches: PatchConfig;

  distribution: Readonly<{
    /** Tuft centers per active Cell at full density. */
    anchorsPerCell: number;
    /** Grass blades per tuft at full density. */
    elementsPerAnchor: number;
    /** Maximum radial root offset, clipped to the Cell boundary. */
    elementRadiusMeters: number;
  }>;

  visibility: Readonly<{
    maximumDistanceMeters: number;
  }>;

  density: Readonly<{
    /** Maximum number of vegetation Cells along one render-tile edge. */
    renderTileSizeCells: number;
    /** Fraction of mask-active Cells admitted into the tile. */
    activeCells: readonly VegetationDensityCurvePoint[];
    /** Fraction of the admitted Cells' maximum Anchor capacity. */
    activeAnchors: readonly VegetationDensityCurvePoint[];
    /** Fraction of the admitted Anchors' maximum Element capacity. */
    activeElements: readonly VegetationDensityCurvePoint[];
  }>;

  pattern: Omit<VegetationPatternConfig, 'anchorsPerCell'>;

  blade: Readonly<{
    segments: number;
    heightSampling: VegetationHeightSampling;
    heightMeters: NumericRange;
    widthMeters: NumericRange;
    topWidthRatio: number;
    maximumTiltDegrees: number;
    cameraFacing: Readonly<{
      startsAtMeters: number;
      reachesFullAtMeters: number;
    }>;
  }>;

  bladeThicknessDistanceScaling: Readonly<{
    defaultScale: number;
    maximumScale: number;
    startsIncreasingAtMeters: number;
    reachesMaximumAtMeters: number;
    curveStrength: number;
  }>;

  colors: Readonly<{
    bottomColors: readonly HexColor[];
    topColors: readonly HexColor[];
    verticalColorTransition: Readonly<{
      startsAtBladeRatio: number;
      endsAtBladeRatio: number;
    }>;
    distanceColorTransition: Readonly<{
      farTint: HexColor;
      startsAtMeters: number;
      endsAtMeters: number;
      curveStrength: number;
    }> | Readonly<{
      target: 'ground';
      bottom: VegetationColorDistanceCurve;
      top: VegetationColorDistanceCurve;
    }>;
  }>;

  lighting: Readonly<{
    /** Near-grass direct sun contribution; ground-color transitions converge to full Lambert light. */
    directLightWeight: number;
  }>;

  shadows: Readonly<{
    receive: boolean;
  }>;
}>;

/** Pure frontend data. Algorithm and module references deliberately live elsewhere. */
export type VegetationRuntimeConfig = Readonly<{
  configVersion: 2;
  assetUrl: string;
  layers: readonly VegetationRuntimeLayerConfig[];
}>;
