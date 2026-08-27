import type { VegetationRuntimeConfig, VegetationRuntimeLayerConfig } from '../config/types.js';
import type { VegetationPatternSet } from '../patterns/types.js';
import type { ParsedVegFile, ParsedVegLayer } from '../parser/types.js';

export type VegetationRuntimeLayer = Readonly<{
  layerId: number;
  key: string;
  enabled: boolean;
  fileLayer: ParsedVegLayer;
  config: VegetationRuntimeLayerConfig;
  patterns: VegetationPatternSet;
  cellSizeUnits: number;
  cellSizeMeters: number;
}>;

/** Complete renderer-independent runtime input for one vegetation asset. */
export type VegetationRuntimeDataset = Readonly<{
  file: ParsedVegFile;
  config: VegetationRuntimeConfig;
  layers: readonly VegetationRuntimeLayer[];
  enabledLayers: readonly VegetationRuntimeLayer[];
}>;
