import type { VegetationRuntimeConfig } from '../configuration/VegetationRuntimeConfig.js';
import type { VegetationLayerPreparation } from '../layer-profile-preparation/VegetationLayerPreparation.js';
import { prepareVegetationRuntimeData } from './prepareVegetationRuntimeData.js';
import type {
  PreparedVegetationRuntime,
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from './VegetationPreparationTypes.js';

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
    const preparedRuntime = prepareVegetationRuntimeData(
      source,
      config,
      this.#layerPreparations,
    );
    throwIfVegetationPreparationAborted(signal);
    return preparedRuntime;
  }
}

export function throwIfVegetationPreparationAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Vegetation preparation aborted.');
  error.name = 'AbortError';
  throw error;
}
