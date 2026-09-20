import type { VegetationRuntimeLayerConfig } from '../configuration/VegetationRuntimeConfig.js';
import type { ParsedVegFile, ParsedVegLayer } from '../../vegfile-v2-parsing/ParsedVegetationFile.js';
import type { VegetationLayerCullingBounds } from '../layer-profile-preparation/VegetationLayerPreparation.js';

export type VegetationRuntimeLayer<
  TConfig extends VegetationRuntimeLayerConfig = VegetationRuntimeLayerConfig,
  TProfileData = unknown,
> = Readonly<{
  layerId: number;
  key: string;
  fileLayer: ParsedVegLayer;
  config: TConfig;
  /** Profile-owned CPU data created only for an enabled runtime layer. */
  preparedProfileData: TProfileData;
  /** Maximum geometry extent supplied by the owning profile for culling. */
  cullingBounds: VegetationLayerCullingBounds;
  cellSizeModelUnits: number;
}>;

/** Complete renderer-independent runtime input for one vegetation asset. */
export type VegetationRuntimeDataset = Readonly<{
  file: ParsedVegFile;
  /** Reverse lookup: stored chunk index -> interleaved Grid X/Y coordinates. */
  storedChunkGridCoordinates: Uint32Array;
  /** Only configured and enabled layers reach CPU/GPU preparation. */
  preparedLayers: readonly VegetationRuntimeLayer[];
  /** Largest profile bounds used by shared coarse chunk culling. */
  combinedCullingBounds: VegetationLayerCullingBounds;
}>;
