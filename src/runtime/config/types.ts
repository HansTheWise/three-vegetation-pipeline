export type HexColor = `#${string}`;

export type NumericRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

export type VegetationHeightSampling = 'bilinear' | 'diagonal-average';

export type VegetationLodLevelConfig = Readonly<{
  cellCoverageRatio: number;
  anchorCount: number;
  elementCount: number;
  bladeSegments: number;
  heightSampling: VegetationHeightSampling;
}>;

export type VegetationRuntimeLayerConfig = Readonly<{
  /** Stable layer ID read from the .veg layer metadata. */
  layerId: number;
  key: string;
  enabled: boolean;

  visibility: Readonly<{
    maximumDistanceMeters: number;
  }>;

  lod: Readonly<{
    /** Maximum number of vegetation Cells along one render-tile edge. */
    renderTileSizeCells: number;
    /** Progressive render profiles from nearest to farthest distance. */
    levels: readonly VegetationLodLevelConfig[];
  }>;

  pattern: Readonly<{
    patternCount: number;
    anchorsPerCell: number;
    rotatePerCell: boolean;
    reflectPerCell: boolean;
  }>;

  blade: Readonly<{
    heightMeters: NumericRange;
    widthMeters: NumericRange;
    topWidthRatio: number;
    maximumTiltDegrees: number;
  }>;

  bladeCount: Readonly<{
    maximumPerAnchor: number;
    /** Maximum radial distance of a blade root from its Anchor. */
    maximumOffsetMeters: number;
    startsDecreasingAtMeters: number;
    reachesZeroAtMeters: number;
    curveStrength: number;
    /** Distance over which an admitted blade rises from or sinks into the ground. */
    growthTransitionDistanceMeters: number;
    /** Visible blade fraction at the far edge of its LOD transition. */
    lodTransitionStartVisibleRatio: number;
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
    }>;
  }>;

  lighting: Readonly<{
    normalUpBias: number;
  }>;

  cameraFacing: Readonly<{
    topViewStartsAtDegrees: number;
    topViewFullyAppliedAtDegrees: number;
    maximumTiltDegrees: number;
  }>;

  shadows: Readonly<{
    receive: boolean;
    cast: boolean;
    castUntilMeters: number;
  }>;

  wind: Readonly<{
    strength: number;
    speed: number;
    spatialFrequency: number;
    gustStrength: number;
    gustFrequency: number;
    variation: number;
  }>;
}>;

/** Pure frontend data. Algorithm and module references deliberately live elsewhere. */
export type VegetationRuntimeConfig = Readonly<{
  configVersion: 1;
  assetUrl: string;
  layers: readonly VegetationRuntimeLayerConfig[];
}>;
