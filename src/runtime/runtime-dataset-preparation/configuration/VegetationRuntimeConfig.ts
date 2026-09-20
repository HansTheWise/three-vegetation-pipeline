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

export type VegetationPatternConfig = Readonly<{
  patternCount: number;
  anchorsPerCell: number;
  rotatePerCell: boolean;
  reflectPerCell: boolean;
}>;

export type VegetationRenderProfileConfig = Readonly<{
  type: string;
}> & Readonly<Record<string, unknown>>;

export type VegetationLayerLightingConfig = Readonly<Record<string, unknown>>;

export type VegetationRuntimeLayerConfig<
  TProfile extends VegetationRenderProfileConfig = VegetationRenderProfileConfig,
> = Readonly<{
  /** Stable layer ID read from the .veg layer metadata. */
  layerId: number;
  key: string;
  enabled: boolean;
  renderProfile: TProfile;
}>;

/** Pure frontend data. Algorithm and module references deliberately live elsewhere. */
export type VegetationRuntimeConfig<
  TLayer extends VegetationRuntimeLayerConfig = VegetationRuntimeLayerConfig,
> = Readonly<{
  configVersion: 3;
  layers: readonly TLayer[];
}>;
