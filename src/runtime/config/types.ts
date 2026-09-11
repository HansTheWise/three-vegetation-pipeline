import type { GrassPatchConfig } from '../profiles/grass/patches/types.js';

export type HexColor = `#${string}`;

export type NumericRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

export type VegetationHeightSampling = 'bilinear' | 'diagonal-average';

export type VegetationDistanceCurve = Readonly<{
  startsAtMeters: number;
  endsAtMeters: number;
  curveStrength: number;
}>;

export type VegetationColorDistanceCurve = VegetationDistanceCurve;

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

export type VegetationRenderBounds = Readonly<{
  horizontalPaddingMeters: number;
  belowSurfaceMeters: number;
  aboveSurfaceMeters: number;
}>;

export type VegetationRenderProfileConfig = Readonly<{
  type: string;
}> & Readonly<Record<string, unknown>>;

export type VegetationLayerLightingConfig = Readonly<Record<string, unknown>>;

export type GrassLightingNormalConfig = Readonly<{
  source: 'ground';
}> | Readonly<{
  source: 'geometry';
}> | Readonly<{
  source: 'mixed';
  groundWeight: number;
}>;

export type GrassLightDistanceTransitionConfig = Readonly<{
  directLightWeight: number;
  indirectLightWeight: number;
  bottom: VegetationDistanceCurve;
  top: VegetationDistanceCurve;
}>;

export type GrassLayerLightingConfig = VegetationLayerLightingConfig & Readonly<{
  /** Direct scene-light contribution near the camera. */
  directLightWeight: number;
  /** Ambient and hemisphere-light contribution near the camera. */
  indirectLightWeight: number;
  normal: GrassLightingNormalConfig;
  distanceTransition?: GrassLightDistanceTransitionConfig;
}>;

export type GrassRenderProfileConfig = VegetationRenderProfileConfig & Readonly<{
  type: 'grass';

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
}>;

export type VegetationRuntimeLayerConfig<
  TProfile extends VegetationRenderProfileConfig = VegetationRenderProfileConfig,
> = Readonly<{
  /** Stable layer ID read from the .veg layer metadata. */
  layerId: number;
  key: string;
  enabled: boolean;
  renderBounds: VegetationRenderBounds;

  renderProfile: TProfile;
}>;

export type GrassRuntimeLayerConfig = VegetationRuntimeLayerConfig<
  GrassRenderProfileConfig
> & Readonly<{
  patches: GrassPatchConfig;

  distribution: Readonly<{
    /** Anchors per active Cell at full density. */
    anchorsPerCell: number;
    /** Renderable Elements per Anchor at full density. */
    elementsPerAnchor: number;
    /** Maximum radial Element offset, clipped to the Cell boundary. */
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

  lighting: GrassLayerLightingConfig;

  shadows: Readonly<{
    cast: boolean;
    receive: boolean;
  }>;

}>;

/** Pure frontend data. Algorithm and module references deliberately live elsewhere. */
export type VegetationRuntimeConfig<
  TLayer extends VegetationRuntimeLayerConfig = VegetationRuntimeLayerConfig,
> = Readonly<{
  configVersion: 3;
  layers: readonly TLayer[];
}>;
