import type { VegetationRuntimeConfig } from '../config/types.js';
import { createVegetationRuntimeDataset } from '../dataset/createVegetationRuntimeDataset.js';
import { createVegetationActiveCellData } from '../density/VegetationRenderTileDensity.js';
import { parseVegFile } from '../parser/VegParser.js';
import type {
  PreparedVegetationRuntime,
  VegetationPreparationAdapter,
  VegetationRuntimeSource,
} from './types.js';

/** Performs parsing and static Cell admission on the calling thread. */
export class SynchronousVegetationPreparation implements VegetationPreparationAdapter {
  prepare(
    source: VegetationRuntimeSource,
    config: VegetationRuntimeConfig,
    signal: AbortSignal,
  ): PreparedVegetationRuntime {
    throwIfVegetationPreparationAborted(signal);
    const start = performance.now();
    const dataset = createVegetationRuntimeDataset(parseVegFile(source), config);
    const activeCells = dataset.enabledLayers.map((layer) => (
      createVegetationActiveCellData(dataset, layer.layerId)
    ));
    throwIfVegetationPreparationAborted(signal);
    return {
      dataset,
      activeCells,
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
