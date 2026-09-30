import { validateVegetationRuntimeConfig } from '../configuration/validateVegetationRuntimeConfig.js';
import type { VegetationRuntimeConfig } from '../configuration/VegetationRuntimeConfig.js';
import { VEGETATION_ID_UINT32_MAX } from '../../../layer-profiles/reusable-profile-features/deterministic-vegetation-identity/VegetationIds.js';
import { createStoredChunkGridCoordinateLookup } from './createStoredChunkGridCoordinateLookup.js';
import type { ParsedVegFile } from '../../../shared/vegfile-parsing/ParsedVegFileTypes.js';
import {
  createVegetationLayerPreparationRegistry,
  createPreparedVegetationLayerProfile,
  type VegetationLayerCullingBounds,
  type VegetationLayerPreparation,
} from '../layer-profile-preparation/VegetationLayerPreparation.js';
import type { PreparedVegetationDataset, VegetationLayer } from './PreparedVegetationDataset.js';

/** Strictly joins parsed VEGFILE data and runtime configuration by stable layer ID. */
export function createPreparedVegetationDataset(
  file: ParsedVegFile,
  config: VegetationRuntimeConfig,
  layerPreparations: readonly VegetationLayerPreparation[] = [],
): PreparedVegetationDataset {
  const preparationRegistry = createVegetationLayerPreparationRegistry(layerPreparations);
  validateVegetationRuntimeConfig(config, [...preparationRegistry.values()]);

  const fileLayersByVegetationLayerId = new Map(
    file.layers.map((layer) => [layer.vegetationLayerId, layer]),
  );
  if (fileLayersByVegetationLayerId.size !== file.layers.length) {
    throw new Error('Parsed VEGFILE layer IDs must be unique.');
  }
  const configLayersByVegetationLayerId = new Map(
    config.layers.map((layer) => [layer.vegetationLayerId, layer]),
  );
  const storedChunkGridCoordinateLookup = createStoredChunkGridCoordinateLookup(file);

  for (const configLayer of config.layers) {
    if (!fileLayersByVegetationLayerId.has(configLayer.vegetationLayerId)) {
      throw new Error(
        `Runtime layer ${configLayer.vegetationLayerId} does not exist in the parsed VEGFILE.`,
      );
    }
  }

  const preparedLayers = file.layers.flatMap((fileLayer): VegetationLayer[] => {
    const layerConfig = configLayersByVegetationLayerId.get(fileLayer.vegetationLayerId);
    if (!layerConfig?.enabled) return [];
    validateGlobalCellCoordinates(
      file,
      fileLayer.maskResolutionPerChunkAxis,
      fileLayer.vegetationLayerId,
    );
    const preparedProfile = createPreparedVegetationLayerProfile(
      preparationRegistry,
      file,
      fileLayer,
      storedChunkGridCoordinateLookup,
      layerConfig,
    );
    return [{
      vegetationLayerId: fileLayer.vegetationLayerId,
      vegetationLayerKey: layerConfig.vegetationLayerKey,
      fileLayer,
      config: layerConfig,
      preparedProfileData: preparedProfile.preparedProfileData,
      cullingBounds: preparedProfile.cullingBounds,
      cellSizeModelUnits: file.header.grid.chunkSize / fileLayer.maskResolutionPerChunkAxis,
    }];
  });

  return {
    file,
    storedChunkGridCoordinateLookup,
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
  maskResolutionPerChunkAxis: number,
  vegetationLayerId: number,
): void {
  const globalCellWidth = file.header.grid.width * maskResolutionPerChunkAxis;
  const globalCellHeight = file.header.grid.height * maskResolutionPerChunkAxis;
  const maximumCoordinateCount = VEGETATION_ID_UINT32_MAX + 1;
  if (!Number.isSafeInteger(globalCellWidth)
    || !Number.isSafeInteger(globalCellHeight)
    || globalCellWidth > maximumCoordinateCount
    || globalCellHeight > maximumCoordinateCount) {
    throw new Error(`Runtime layer ${vegetationLayerId} exceeds the 32-bit global Cell-ID range.`);
  }
}
