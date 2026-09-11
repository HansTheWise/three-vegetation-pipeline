import type { VegetationRuntimeConfig } from '../config/types.js';
import { createVegetationRuntimeDataset } from '../dataset/createVegetationRuntimeDataset.js';
import { parseVegFile } from '../parser/VegParser.js';
import type { VegetationLayerPreparation } from '../profiles/VegetationLayerPreparation.js';
import type {
  PreparedVegetationRuntime,
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from './types.js';

/** Performs parsing and static Cell admission on the calling thread. */
export class SynchronousVegetationPreparation implements VegetationPreparationAdapter {
  readonly #layerPreparations: readonly VegetationLayerPreparation[];

  constructor(layerPreparations: readonly VegetationLayerPreparation[] = []) {
    this.#layerPreparations = layerPreparations;
  }

  prepare(
    source: VegetationRuntimeSource,
    config: VegetationRuntimeConfig,
    signal: AbortSignal,
  ): PreparedVegetationRuntime {
    throwIfVegetationPreparationAborted(signal);
    const start = performance.now();
    const dataset = createVegetationRuntimeDataset(
      parseVegFile(source),
      config,
      this.#layerPreparations,
    );
    throwIfVegetationPreparationAborted(signal);
    return {
      dataset,
      preparationMilliseconds: performance.now() - start,
    };
  }
}

export function throwIfVegetationPreparationAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Vegetation preparation aborted.');
  error.name = 'AbortError';
  throw error;
}
