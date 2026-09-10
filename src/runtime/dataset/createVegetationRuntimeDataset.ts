import { validateVegetationRuntimeConfig } from '../config/validateVegetationRuntimeConfig.js';
import type { VegetationRenderBounds, VegetationRuntimeConfig } from '../config/types.js';
import { createVegetationPatterns } from '../patterns/VegetationPatterns.js';
import { VEGETATION_ID_UINT32_MAX } from '../identity/VegetationIds.js';
import type { ParsedVegFile } from '../parser/types.js';
import { createGroundPatchField } from '../patches/createGroundPatchField.js';
import type { VegetationRuntimeDataset, VegetationRuntimeLayer } from './types.js';

/** Strictly joins parsed VEGFILE data and runtime configuration by stable layer ID. */
export function createVegetationRuntimeDataset(
  file: ParsedVegFile,
  config: VegetationRuntimeConfig,
): VegetationRuntimeDataset {
  validateVegetationRuntimeConfig(config);

  const fileLayersById = new Map(file.layers.map((layer) => [layer.id, layer]));
  if (fileLayersById.size !== file.layers.length) {
    throw new Error('Parsed VEGFILE layer IDs must be unique.');
  }
  const configLayersById = new Map(config.layers.map((layer) => [layer.layerId, layer]));

  for (const fileLayer of file.layers) {
    if (!configLayersById.has(fileLayer.id)) {
      throw new Error(`VEGFILE layer ${fileLayer.id} has no runtime configuration.`);
    }
  }
  for (const configLayer of config.layers) {
    if (!fileLayersById.has(configLayer.layerId)) {
      throw new Error(
        `Runtime layer ${configLayer.layerId} does not exist in the parsed VEGFILE.`,
      );
    }
  }

  const layers = file.layers.map((fileLayer): VegetationRuntimeLayer => {
    const layerConfig = configLayersById.get(fileLayer.id)!;
    validateGlobalCellCoordinates(file, fileLayer.maskResolution, fileLayer.id);
    const cellSizeUnits = file.header.grid.chunkSize / fileLayer.maskResolution;
    return {
      layerId: fileLayer.id,
      key: layerConfig.key,
      enabled: layerConfig.enabled,
      fileLayer,
      config: layerConfig,
      patterns: createVegetationPatterns(
        file.header.seed,
        { ...layerConfig.pattern, anchorsPerCell: layerConfig.distribution.anchorsPerCell },
      ),
      groundPatchField: layerConfig.enabled
        ? createGroundPatchField(file, fileLayer.id, layerConfig.patches.ground)
        : undefined,
      cellSizeUnits,
      cellSizeMeters: cellSizeUnits / file.header.coordinateSystem.unitsPerMeter,
    };
  });

  const enabledLayers = layers.filter((layer) => layer.enabled);
  return {
    file,
    config,
    layers,
    enabledLayers,
    renderBounds: combineRenderBounds(enabledLayers.map((layer) => layer.config.renderBounds)),
  };
}

function combineRenderBounds(
  layerBounds: readonly VegetationRenderBounds[],
): VegetationRenderBounds {
  return layerBounds.reduce<VegetationRenderBounds>((combined, bounds) => ({
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
