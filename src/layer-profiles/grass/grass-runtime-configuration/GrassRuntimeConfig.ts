import type { GrassPatchConfig } from '../grass-ground-patch-generation/GrassGroundPatchTypes.js';
import type { VegetationDensityCurvePoint } from '../../reusable-profile-features/render-tile-density-selection/DensitySelectionTypes.js';
import type {
  HexColor,
  NumericRange,
  VegetationColorDistanceCurve,
  VegetationDistanceCurve,
  VegetationHeightSampling,
  VegetationLayerLightingConfig,
  VegetationPatternConfig,
  VegetationRenderProfileConfig,
  VegetationRuntimeLayerConfig,
} from '../../../runtime/dataset-preparation/configuration/VegetationRuntimeConfig.js';

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

export type GrassCloverConfig = Readonly<{
  enabled: false;
}> | Readonly<{
  enabled: true;
  maximumRatio: number;
  groundColorBias: number;
  preferredGroundColor: HexColor;
  colorTolerance: number;
  sizeMeters: NumericRange;
  heightOffsetMeters: number;
  baseColor: HexColor;
  highlightColor: HexColor;
}>;

export type GrassLayerLightingConfig = VegetationLayerLightingConfig & Readonly<{
  directLightWeight: number;
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
    groundColorAdaptation?: Readonly<{
      bottomBias: number;
      topBias: number;
    }>;
  }>;
  clover?: GrassCloverConfig;
}>;

export type GrassRuntimeLayerConfig = VegetationRuntimeLayerConfig<
  GrassRenderProfileConfig
> & Readonly<{
  patches: GrassPatchConfig;
  distribution: Readonly<{
    anchorsPerCell: number;
    elementsPerAnchor: number;
    elementRadiusMeters: number;
  }>;
  visibility: Readonly<{
    maximumDistanceMeters: number;
  }>;
  density: Readonly<{
    renderTileSizeCells: number;
    activeCells: readonly VegetationDensityCurvePoint[];
    activeAnchors: readonly VegetationDensityCurvePoint[];
    activeElements: readonly VegetationDensityCurvePoint[];
  }>;
  pattern: Omit<VegetationPatternConfig, 'anchorsPerCell'>;
  lighting: GrassLayerLightingConfig;
  shadows: Readonly<{
    cast: boolean;
    receive: boolean;
  }>;
}>;
