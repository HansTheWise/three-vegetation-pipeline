import type { VegetationRuntimeLayerConfig } from '../configuration/VegetationRuntimeConfig.js';
import type { ParsedVegFile, ParsedVegLayer } from '../../../shared/vegfile-parsing/ParsedVegFileTypes.js';
import type { VegetationLayerCullingBounds } from '../layer-profile-preparation/VegetationLayerPreparation.js';
import type { VegetationLayerId } from '../../../shared/vegfile-format/VegetationFileTypes.js';

export type VegetationLayer<
  TConfig extends VegetationRuntimeLayerConfig = VegetationRuntimeLayerConfig,
  TProfileData = unknown,
> = Readonly<{
  vegetationLayerId: VegetationLayerId;
  vegetationLayerKey: string;
  fileLayer: ParsedVegLayer;
  config: TConfig;
  /** Profile-owned CPU data created only for an enabled runtime layer. */
  preparedProfileData: TProfileData;
  /** Maximum geometry extent supplied by the owning profile for culling. */
  cullingBounds: VegetationLayerCullingBounds;
  cellSizeModelUnits: number;
}>;

/** Complete renderer-independent runtime input for one vegetation asset. */
export type PreparedVegetationDataset = Readonly<{
  file: ParsedVegFile;
  /** Reverse lookup: stored chunk index -> interleaved Grid X/Y coordinates. */
  storedChunkGridCoordinateLookup: Uint32Array;
  /** Only configured and enabled layers reach CPU/GPU preparation. */
  preparedLayers: readonly VegetationLayer[];
  /** Largest profile bounds used by shared coarse chunk culling. */
  combinedCullingBounds: VegetationLayerCullingBounds;
}>;
