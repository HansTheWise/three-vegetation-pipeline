import { validateVegetationRuntimeConfig } from '../configuration/validateVegetationRuntimeConfig.js';
import type { VegetationRuntimeConfig } from '../configuration/VegetationRuntimeConfig.js';
import { VEGETATION_ID_UINT32_MAX } from '../../../layer-profiles/reusable-profile-features/deterministic-vegetation-identity/VegetationIds.js';
import { createStoredChunkGridCoordinates } from '../../stored-chunk-visibility/stored-chunk-grid-coordinates/StoredChunkGridCoordinates.js';
import type { ParsedVegFile } from '../../vegfile-v2-parsing/ParsedVegetationFile.js';
import {
  createVegetationLayerPreparationRegistry,
  prepareVegetationLayerProfile,
  type VegetationLayerCullingBounds,
  type VegetationLayerPreparation,
} from '../layer-profile-preparation/VegetationLayerPreparation.js';
import type { VegetationRuntimeDataset, VegetationRuntimeLayer } from './VegetationRuntimeDataset.js';

/** Strictly joins parsed VEGFILE data and runtime configuration by stable layer ID. */
export function createVegetationRuntimeDataset(
  file: ParsedVegFile,
  config: VegetationRuntimeConfig,
  layerPreparations: readonly VegetationLayerPreparation[] = [],
): VegetationRuntimeDataset {
  const preparationRegistry = createVegetationLayerPreparationRegistry(layerPreparations);
  validateVegetationRuntimeConfig(config, [...preparationRegistry.values()]);

  const fileLayersById = new Map(file.layers.map((layer) => [layer.id, layer]));
  if (fileLayersById.size !== file.layers.length) {
    throw new Error('Parsed VEGFILE layer IDs must be unique.');
  }
  const configLayersById = new Map(config.layers.map((layer) => [layer.layerId, layer]));
  const storedChunkGridCoordinates = createStoredChunkGridCoordinates(file);

  for (const configLayer of config.layers) {
    if (!fileLayersById.has(configLayer.layerId)) {
      throw new Error(
        `Runtime layer ${configLayer.layerId} does not exist in the parsed VEGFILE.`,
      );
    }
  }

  const preparedLayers = file.layers.flatMap((fileLayer): VegetationRuntimeLayer[] => {
    const layerConfig = configLayersById.get(fileLayer.id);
    if (!layerConfig?.enabled) return [];
    validateGlobalCellCoordinates(file, fileLayer.maskResolution, fileLayer.id);
    const preparedProfile = prepareVegetationLayerProfile(
      preparationRegistry,
      file,
      fileLayer,
      storedChunkGridCoordinates,
      layerConfig,
    );
    return [{
      layerId: fileLayer.id,
      key: layerConfig.key,
      fileLayer,
      config: layerConfig,
      preparedProfileData: preparedProfile.preparedProfileData,
      cullingBounds: preparedProfile.cullingBounds,
      cellSizeModelUnits: file.header.grid.chunkSize / fileLayer.maskResolution,
    }];
  });

  return {
    file,
    storedChunkGridCoordinates,
    preparedLayers,
    combinedCullingBounds: combineCullingBounds(
      preparedLayers.map((layer) => layer.cullingBounds),
    ),
  };
}

function combineCullingBounds(
  layerBounds: readonly VegetationLayerCullingBounds[],
): VegetationLayerCullingBounds {
  return layerBounds.reduce<VegetationLayerCullingBounds>((combined, bounds) => ({
    horizontalPaddingMeters: Math.max(
      combined.horizontalPaddingMeters,
      bounds.horizontalPaddingMeters,
    ),
    belowSurfaceMeters: Math.max(combined.belowSurfaceMeters, bounds.belowSurfaceMeters),
    aboveSurfaceMeters: Math.max(combined.aboveSurfaceMeters, bounds.aboveSurfaceMeters),
  }), {
    horizontalPaddingMeters: 0,
    belowSurfaceMeters: 0,
    aboveSurfaceMeters: 0,
  });
}

function validateGlobalCellCoordinates(
  file: ParsedVegFile,
  maskResolution: number,
  layerId: number,
): void {
  const globalCellWidth = file.header.grid.width * maskResolution;
  const globalCellHeight = file.header.grid.height * maskResolution;
  const maximumCoordinateCount = VEGETATION_ID_UINT32_MAX + 1;
  if (!Number.isSafeInteger(globalCellWidth)
    || !Number.isSafeInteger(globalCellHeight)
    || globalCellWidth > maximumCoordinateCount
    || globalCellHeight > maximumCoordinateCount) {
    throw new Error(`Runtime layer ${layerId} exceeds the 32-bit global Cell-ID range.`);
  }
}
