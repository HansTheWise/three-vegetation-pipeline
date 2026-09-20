import type { VegetationRuntimeLayerConfig } from '../configuration/VegetationRuntimeConfig.js';
import type { ParsedVegFile, ParsedVegLayer } from '../../vegfile-v2-parsing/ParsedVegetationFile.js';

export type VegetationLayerPreparation = Readonly<{
  profileType: string;
  validateConfig?(config: VegetationRuntimeLayerConfig): void;
  prepare(
    file: ParsedVegFile,
    fileLayer: ParsedVegLayer,
    storedChunkGridCoordinates: Uint32Array,
    config: VegetationRuntimeLayerConfig,
  ): PreparedVegetationLayerProfile;
  collectTransferBuffers?(data: unknown, buffers: Set<ArrayBuffer>): void;
}>;

/** Maximum profile geometry extent used only for conservative runtime culling. */
export type VegetationLayerCullingBounds = Readonly<{
  horizontalPaddingMeters: number;
  belowSurfaceMeters: number;
  aboveSurfaceMeters: number;
}>;

export type PreparedVegetationLayerProfile<TPreparedProfileData = unknown> = Readonly<{
  cullingBounds: VegetationLayerCullingBounds;
  preparedProfileData: TPreparedProfileData;
}>;

export type VegetationLayerPreparationRegistry = ReadonlyMap<
  string,
  VegetationLayerPreparation
>;

export function createVegetationLayerPreparationRegistry(
  customPreparations: readonly VegetationLayerPreparation[] = [],
): VegetationLayerPreparationRegistry {
  const registry = new Map<string, VegetationLayerPreparation>();
  for (const preparation of customPreparations) {
    if (preparation.profileType.length === 0) {
      throw new Error('Vegetation layer preparation profileType must not be empty.');
    }
    if (registry.has(preparation.profileType)) {
      throw new Error(
        `Duplicate vegetation layer preparation for profile "${preparation.profileType}".`,
      );
    }
    registry.set(preparation.profileType, preparation);
  }
  return registry;
}

/** Dispatches CPU preparation to the registered owner of a layer profile. */
export function prepareVegetationLayerProfile(
  registry: VegetationLayerPreparationRegistry,
  file: ParsedVegFile,
  fileLayer: ParsedVegLayer,
  storedChunkGridCoordinates: Uint32Array,
  config: VegetationRuntimeLayerConfig,
): PreparedVegetationLayerProfile {
  const preparation = registry.get(config.renderProfile.type);
  if (!preparation) {
    throw new Error(
      `No vegetation layer preparation is registered for profile "${config.renderProfile.type}".`,
    );
  }
  const preparedProfile = preparation.prepare(
    file,
    fileLayer,
    storedChunkGridCoordinates,
    config,
  );
  validateVegetationLayerCullingBounds(preparedProfile.cullingBounds, config.key);
  return preparedProfile;
}

function validateVegetationLayerCullingBounds(
  bounds: VegetationLayerCullingBounds,
  layerKey: string,
): void {
  for (const [name, value] of Object.entries(bounds)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Runtime layer "${layerKey}" cullingBounds.${name} must be a non-negative finite number.`,
      );
    }
  }
}

export function collectVegetationLayerTransferBuffers(
  registry: VegetationLayerPreparationRegistry,
  profileType: string,
  preparedProfileData: unknown,
  buffers: Set<ArrayBuffer>,
): void {
  registry.get(profileType)?.collectTransferBuffers?.(preparedProfileData, buffers);
}
