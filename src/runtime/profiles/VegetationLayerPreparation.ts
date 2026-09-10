import type { VegetationRuntimeLayerConfig } from '../config/types.js';
import type { ParsedVegFile } from '../parser/types.js';
import { grassLayerPreparation } from './grass/GrassLayerPreparation.js';

type BuiltInLayerPreparation = Readonly<{
  prepare(
    file: ParsedVegFile,
    layerId: number,
    config: VegetationRuntimeLayerConfig,
  ): unknown;
  collectTransferBuffers(data: unknown, buffers: Set<ArrayBuffer>): void;
}>;

const builtInLayerPreparations = new Map<string, BuiltInLayerPreparation>([
  ['grass', grassLayerPreparation],
]);

/** Dispatches optional CPU preparation to the built-in owner of a layer profile. */
export function prepareBuiltInVegetationLayerData(
  file: ParsedVegFile,
  layerId: number,
  config: VegetationRuntimeLayerConfig,
): unknown {
  return builtInLayerPreparations.get(config.renderProfile.type)?.prepare(
    file,
    layerId,
    config,
  );
}

export function collectBuiltInVegetationLayerTransferBuffers(
  profileType: string,
  data: unknown,
  buffers: Set<ArrayBuffer>,
): void {
  builtInLayerPreparations.get(profileType)?.collectTransferBuffers(data, buffers);
}
