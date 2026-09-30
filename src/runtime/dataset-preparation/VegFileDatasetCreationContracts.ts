import type { VegetationRuntimeConfig } from './configuration/VegetationRuntimeConfig.js';
import type { PreparedVegetationDataset } from './dataset-construction/PreparedVegetationDataset.js';

export type VegetationRuntimeSource = ArrayBuffer | Uint8Array;

export type VegetationDatasetCreationResult = Readonly<{
  dataset: PreparedVegetationDataset;
  datasetCreationMilliseconds: number;
}>;

export interface VegFileDatasetCreationAdapter {
  createVegetationDataset(
    vegFileBytes: VegetationRuntimeSource,
    vegetationRuntimeConfig: VegetationRuntimeConfig,
    cancellationSignal?: AbortSignal,
  ): VegetationDatasetCreationResult | Promise<VegetationDatasetCreationResult>;
}

export type VegFileDatasetCreationWorkerRequest = Readonly<{
  vegFileBytes: Uint8Array;
  vegetationRuntimeConfig: VegetationRuntimeConfig;
}>;

export type VegFileDatasetCreationWorkerResponse =
  | VegetationDatasetCreationResult
  | Readonly<{ error: string; errorName?: string }>;
