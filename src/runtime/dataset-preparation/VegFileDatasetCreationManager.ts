import { parseVegFile } from '../../shared/vegfile-parsing/VegParser.js';
import type { ParsedVegFile } from '../../shared/vegfile-parsing/ParsedVegFileTypes.js';
import type { VegetationRuntimeConfig } from './configuration/VegetationRuntimeConfig.js';
import { createPreparedVegetationDataset } from './dataset-construction/createPreparedVegetationDataset.js';
import type { PreparedVegetationDataset } from './dataset-construction/PreparedVegetationDataset.js';
import type { VegetationLayerPreparation } from './layer-profile-preparation/VegetationLayerPreparation.js';
import type {
  VegetationDatasetCreationResult,
  VegetationRuntimeSource,
} from './VegFileDatasetCreationContracts.js';

/** Creates the complete renderer-independent runtime dataset from VEGFILE bytes. */
export class VegFileDatasetCreationManager {
  readonly #vegetationLayerPreparations: readonly VegetationLayerPreparation[];

  constructor(vegetationLayerPreparations: readonly VegetationLayerPreparation[] = []) {
    this.#vegetationLayerPreparations = vegetationLayerPreparations;
  }

  createVegetationDataset(
    vegFileBytes: VegetationRuntimeSource,
    vegetationRuntimeConfig: VegetationRuntimeConfig,
  ): VegetationDatasetCreationResult {
    const datasetCreationStartedAt = performance.now();

    const parsedVegFile: ParsedVegFile = parseVegFile(vegFileBytes);
    const vegetationDataset: PreparedVegetationDataset = createPreparedVegetationDataset(
      parsedVegFile,
      vegetationRuntimeConfig,
      this.#vegetationLayerPreparations,
    );

    return {
      dataset: vegetationDataset,
      datasetCreationMilliseconds: performance.now() - datasetCreationStartedAt,
    };
  }
}
