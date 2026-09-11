import type { VegetationRuntimeLayerConfig } from '../config/types.js';
import type { ParsedVegFile } from '../parser/types.js';
import { grassLayerPreparation } from './grass/GrassLayerPreparation.js';

export type VegetationLayerPreparation = Readonly<{
  profileType: string;
  validateConfig?(config: VegetationRuntimeLayerConfig): void;
  prepare?(
    file: ParsedVegFile,
    layerId: number,
    config: VegetationRuntimeLayerConfig,
  ): unknown;
  collectTransferBuffers?(data: unknown, buffers: Set<ArrayBuffer>): void;
}>;

export type VegetationLayerPreparationRegistry = ReadonlyMap<
  string,
  VegetationLayerPreparation
>;

export function createVegetationLayerPreparationRegistry(
  customPreparations: readonly VegetationLayerPreparation[] = [],
): VegetationLayerPreparationRegistry {
  const registry = new Map<string, VegetationLayerPreparation>([
    [grassLayerPreparation.profileType, grassLayerPreparation],
  ]);
  for (const preparation of customPreparations) {
    if (preparation.profileType.length === 0) {
      throw new Error('Vegetation layer preparation profileType must not be empty.');
    }
    registry.set(preparation.profileType, preparation);
  }
  return registry;
}

/** Dispatches optional CPU preparation to the registered owner of a layer profile. */
export function prepareVegetationLayerData(
  registry: VegetationLayerPreparationRegistry,
  file: ParsedVegFile,
  layerId: number,
  config: VegetationRuntimeLayerConfig,
): unknown {
  return registry.get(config.renderProfile.type)?.prepare?.(
    file,
    layerId,
    config,
  );
}

export function collectVegetationLayerTransferBuffers(
  registry: VegetationLayerPreparationRegistry,
  profileType: string,
  data: unknown,
  buffers: Set<ArrayBuffer>,
): void {
  registry.get(profileType)?.collectTransferBuffers?.(data, buffers);
}
