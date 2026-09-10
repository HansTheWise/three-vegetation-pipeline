import type { PatchConfig } from '../../patches/types.js';
import type {
  GrassRenderProfileConfig,
  GrassRuntimeLayerConfig,
  GrassLightDistanceTransitionConfig,
  GrassLightingNormalConfig,
  HexColor,
  NumericRange,
  VegetationColorDistanceCurve,
  VegetationDensityCurvePoint,
  VegetationHeightSampling,
} from '../../config/types.js';

type GrassBladeOverrides = Readonly<{
  segments?: number;
  heightSampling?: VegetationHeightSampling;
  heightMeters?: NumericRange;
  widthMeters?: NumericRange;
  topWidthRatio?: number;
  maximumTiltDegrees?: number;
  cameraFacing?: Readonly<{
    startsAtMeters?: number;
    reachesFullAtMeters?: number;
  }>;
}>;

type GrassColorOverrides = Readonly<{
  bottomColors?: readonly HexColor[];
  topColors?: readonly HexColor[];
  verticalColorTransition?: Readonly<{
    startsAtBladeRatio?: number;
    endsAtBladeRatio?: number;
  }>;
  distanceColorTransition?: Readonly<{
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

export type GrassLayerPresetOptions = Readonly<{
  layerId: number;
  key: string;
  enabled?: boolean;
  patches?: PatchConfig;
  distribution?: Readonly<{
    anchorsPerCell?: number;
    elementsPerAnchor?: number;
    elementRadiusMeters?: number;
  }>;
  visibility?: Readonly<{
    maximumDistanceMeters?: number;
  }>;
  density?: Readonly<{
    renderTileSizeCells?: number;
    activeCells?: readonly VegetationDensityCurvePoint[];
    activeAnchors?: readonly VegetationDensityCurvePoint[];
    activeElements?: readonly VegetationDensityCurvePoint[];
  }>;
  pattern?: Readonly<{
    patternCount?: number;
    rotatePerCell?: boolean;
    reflectPerCell?: boolean;
  }>;
  lighting?: Readonly<{
    directLightWeight?: number;
    indirectLightWeight?: number;
    normal?: GrassLightingNormalConfig;
    distanceTransition?: GrassLightDistanceTransitionConfig;
  }>;
  shadows?: Readonly<{
    cast?: boolean;
    receive?: boolean;
  }>;
  grass?: Readonly<{
    blade?: GrassBladeOverrides;
    bladeThicknessDistanceScaling?: Readonly<{
      defaultScale?: number;
      maximumScale?: number;
      startsIncreasingAtMeters?: number;
      reachesMaximumAtMeters?: number;
      curveStrength?: number;
    }>;
    colors?: GrassColorOverrides;
  }>;
}>;

const DEFAULT_DENSITY_CURVE = [
  { distanceMeters: 0, ratio: 1 },
  { distanceMeters: 60, ratio: 0.5 },
  { distanceMeters: 100, ratio: 0 },
] as const;

const DEFAULT_GRASS_PROFILE = {
  type: 'grass',
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
} as const satisfies GrassRenderProfileConfig;

/** Creates a complete application-neutral grass layer with targeted overrides. */
export function createGrassLayerConfig(
  options: GrassLayerPresetOptions,
): GrassRuntimeLayerConfig {
  const grass = options.grass;
  const blade = grass?.blade;
  const thickness = grass?.bladeThicknessDistanceScaling;
  const colors = grass?.colors;
  const renderProfile: GrassRenderProfileConfig = {
    type: 'grass',
    blade: {
      ...DEFAULT_GRASS_PROFILE.blade,
      ...blade,
      cameraFacing: {
        ...DEFAULT_GRASS_PROFILE.blade.cameraFacing,
        ...blade?.cameraFacing,
      },
    },
    bladeThicknessDistanceScaling: {
      ...DEFAULT_GRASS_PROFILE.bladeThicknessDistanceScaling,
      ...thickness,
    },
    colors: {
      ...DEFAULT_GRASS_PROFILE.colors,
      ...colors,
      verticalColorTransition: {
        ...DEFAULT_GRASS_PROFILE.colors.verticalColorTransition,
        ...colors?.verticalColorTransition,
      },
    },
  };
  const distribution = {
    anchorsPerCell: options.distribution?.anchorsPerCell ?? 4,
    elementsPerAnchor: options.distribution?.elementsPerAnchor ?? 1,
    elementRadiusMeters: options.distribution?.elementRadiusMeters ?? 0.02,
  };
  const density = {
    renderTileSizeCells: options.density?.renderTileSizeCells ?? 16,
    activeCells: options.density?.activeCells ?? DEFAULT_DENSITY_CURVE,
    activeAnchors: options.density?.activeAnchors ?? DEFAULT_DENSITY_CURVE,
    activeElements: options.density?.activeElements ?? [
      { distanceMeters: 0, ratio: 1 },
      { distanceMeters: 100, ratio: 1 },
    ],
  };

  return {
    layerId: options.layerId,
    key: options.key,
    enabled: options.enabled ?? true,
    patches: options.patches ?? { ground: { enabled: false } },
    distribution,
    visibility: {
      maximumDistanceMeters: options.visibility?.maximumDistanceMeters ?? 100,
    },
    density,
    pattern: {
      patternCount: options.pattern?.patternCount ?? 4,
      rotatePerCell: options.pattern?.rotatePerCell ?? true,
      reflectPerCell: options.pattern?.reflectPerCell ?? true,
    },
    lighting: {
      directLightWeight: options.lighting?.directLightWeight ?? 0.8,
      indirectLightWeight: options.lighting?.indirectLightWeight ?? 1,
      normal: options.lighting?.normal ?? { source: 'ground' },
      ...(options.lighting?.distanceTransition
        ? { distanceTransition: options.lighting.distanceTransition }
        : {}),
    },
    shadows: {
      cast: options.shadows?.cast ?? false,
      receive: options.shadows?.receive ?? true,
    },
    renderBounds: createGrassRenderBounds(renderProfile, distribution.elementRadiusMeters),
    renderProfile,
  };
}

function createGrassRenderBounds(
  profile: GrassRenderProfileConfig,
  elementRadiusMeters: number,
) {
  const maximumHeight = profile.blade.heightMeters.maximum;
  const maximumHalfWidth = profile.blade.widthMeters.maximum
    * profile.bladeThicknessDistanceScaling.maximumScale / 2;
  const maximumTiltRadians = profile.blade.maximumTiltDegrees * Math.PI / 180;
  return {
    horizontalPaddingMeters: elementRadiusMeters
      + Math.sin(maximumTiltRadians) * maximumHeight
      + maximumHalfWidth,
    belowSurfaceMeters: 0,
    aboveSurfaceMeters: maximumHeight,
  };
}
