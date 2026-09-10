import type {
  VegetationRenderBounds,
  VegetationRuntimeConfig,
  VegetationRuntimeLayerConfig,
} from '../config/types.js';
import type { VegetationPatternSet } from '../patterns/types.js';
import type { ParsedVegFile, ParsedVegLayer } from '../parser/types.js';

export type VegetationRuntimeLayer<
  TConfig extends VegetationRuntimeLayerConfig = VegetationRuntimeLayerConfig,
  TProfileData = unknown,
> = Readonly<{
  layerId: number;
  key: string;
  enabled: boolean;
  fileLayer: ParsedVegLayer;
  config: TConfig;
  patterns: VegetationPatternSet;
  profileData: TProfileData;
  cellSizeUnits: number;
  cellSizeMeters: number;
}>;

/** Complete renderer-independent runtime input for one vegetation asset. */
export type VegetationRuntimeDataset = Readonly<{
  file: ParsedVegFile;
  config: VegetationRuntimeConfig;
  layers: readonly VegetationRuntimeLayer[];
  enabledLayers: readonly VegetationRuntimeLayer[];
  /** Conservative bounds shared by coarse runtime culling. */
  renderBounds: VegetationRenderBounds;
}>;
