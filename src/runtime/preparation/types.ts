import type { VegetationRuntimeConfig } from '../config/types.js';
import type { VegetationRuntimeDataset } from '../dataset/types.js';

export type VegetationRuntimeSource = ArrayBuffer | Uint8Array;

export type PreparedVegetationRuntime = Readonly<{
  dataset: VegetationRuntimeDataset;
  preparationMilliseconds: number;
}>;

export interface VegetationPreparationAdapter {
  prepare(
    source: VegetationRuntimeSource,
    config: VegetationRuntimeConfig,
    signal: AbortSignal,
  ): PreparedVegetationRuntime | Promise<PreparedVegetationRuntime>;
}

export type VegetationPreparationWorkerRequest = Readonly<{
  source: Uint8Array;
  config: VegetationRuntimeConfig;
}>;

export type VegetationPreparationWorkerResponse =
  | PreparedVegetationRuntime
  | Readonly<{ error: string }>;
