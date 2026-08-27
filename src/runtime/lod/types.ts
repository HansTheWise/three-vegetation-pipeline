export type ModelPosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type VegetationLodLevel = Readonly<{
  cellCount: number;
  cellCoverageRatio: number;
  anchorCount: number;
  elementCount: number;
  bladeSegments: number;
  heightSampling: 'bilinear' | 'diagonal-average';
  distanceDensityRatio: number;
  tileRecords: Uint32Array;
}>;
