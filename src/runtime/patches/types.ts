export type DisabledPatchConfig = Readonly<{
  enabled: false;
}>;

export type EnabledGroundPatchConfig = Readonly<{
  enabled: true;
  /** Additional deterministic seed mixed with the VEGFILE and layer identity. */
  seed: number;
  radiusMeters: Readonly<{
    minimum: number;
    maximum: number;
  }>;
  targetCoverage: number;
  allowMerging: boolean;
  /** Soft edge width for coverage and source-color blending; not distance LOD. */
  edgeFalloffMeters: number;
  shapeDistortion: number;
  colors: Readonly<{
    baseColor: `#${string}`;
    brightnessVariation: number;
  }>;
}>;

export type GroundPatchConfig =
  | DisabledPatchConfig
  | EnabledGroundPatchConfig;

export type PatchConfig = Readonly<{
  ground: GroundPatchConfig;
}>;

/** Color-only RG8: R blends ground regions, G varies their brightness. */
export type GroundPatchField = Readonly<{
  layerId: number;
  data: Uint8Array;
  width: number;
  height: number;
  texelSizeUnits: number;
  texelSizeMeters: number;
  originX: number;
  originY: number;
  baseColor: `#${string}`;
  brightnessVariation: number;
  patchCount: number;
  eligibleSampleCount: number;
  achievedCoverage: number;
}>;

export type GroundPatchFieldSample = Readonly<{
  coverageByte: number;
  colorVariationByte: number;
}>;
