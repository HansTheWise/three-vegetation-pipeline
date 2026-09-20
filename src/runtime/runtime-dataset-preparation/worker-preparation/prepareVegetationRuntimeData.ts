import type { VegetationRuntimeConfig } from '../configuration/VegetationRuntimeConfig.js';
import { createVegetationRuntimeDataset } from '../dataset-construction/createVegetationRuntimeDataset.js';
import { parseVegFile } from '../../vegfile-v2-parsing/VegParser.js';
import type { VegetationLayerPreparation } from '../layer-profile-preparation/VegetationLayerPreparation.js';
import type { PreparedVegetationRuntime, VegetationRuntimeSource } from './VegetationPreparationTypes.js';

/** Shared parser and CPU-preparation path used on both the main thread and Workers. */
export function prepareVegetationRuntimeData(
  source: VegetationRuntimeSource,
  config: VegetationRuntimeConfig,
  layerPreparations: readonly VegetationLayerPreparation[] = [],
): PreparedVegetationRuntime {
  const preparationStartedAt = performance.now();
  const dataset = createVegetationRuntimeDataset(
    parseVegFile(source),
    config,
    layerPreparations,
  );
  return {
    dataset,
    preparationMilliseconds: performance.now() - preparationStartedAt,
  };
}
