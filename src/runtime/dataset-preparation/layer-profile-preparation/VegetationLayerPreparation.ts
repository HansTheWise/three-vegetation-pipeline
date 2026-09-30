import type { VegetationRuntimeLayerConfig } from '../configuration/VegetationRuntimeConfig.js';
import type { ParsedVegFile, ParsedVegLayer } from '../../../shared/vegfile-parsing/ParsedVegFileTypes.js';

export type VegetationLayerPreparation = Readonly<{
  profileType: string;
  validateConfig?(config: VegetationRuntimeLayerConfig): void;
  createPreparedVegetationLayerProfile(
    file: ParsedVegFile,
    fileLayer: ParsedVegLayer,
    storedChunkGridCoordinateLookup: Uint32Array,
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
  vegetationLayerPreparations: readonly VegetationLayerPreparation[] = [],
): VegetationLayerPreparationRegistry {
  const registry = new Map<string, VegetationLayerPreparation>();
  for (const layerPreparation of vegetationLayerPreparations) {
    if (layerPreparation.profileType.length === 0) {
      throw new Error('Vegetation layer preparation profileType must not be empty.');
    }
    if (registry.has(layerPreparation.profileType)) {
      throw new Error(
        `Duplicate vegetation layer preparation for profile "${layerPreparation.profileType}".`,
      );
    }
    registry.set(layerPreparation.profileType, layerPreparation);
  }
  return registry;
}

/** Dispatches CPU preparation to the registered owner of a layer profile. */
export function createPreparedVegetationLayerProfile(
  registry: VegetationLayerPreparationRegistry,
  file: ParsedVegFile,
  fileLayer: ParsedVegLayer,
  storedChunkGridCoordinateLookup: Uint32Array,
  config: VegetationRuntimeLayerConfig,
): PreparedVegetationLayerProfile {
  const layerPreparation = registry.get(config.renderProfile.type);
  if (!layerPreparation) {
    throw new Error(
      `No vegetation layer preparation is registered for profile "${config.renderProfile.type}".`,
    );
  }
  const preparedProfile = layerPreparation.createPreparedVegetationLayerProfile(
    file,
    fileLayer,
    storedChunkGridCoordinateLookup,
    config,
  );
  validateVegetationLayerCullingBounds(preparedProfile.cullingBounds, config.vegetationLayerKey);
  return preparedProfile;
}

function validateVegetationLayerCullingBounds(
  bounds: VegetationLayerCullingBounds,
  vegetationLayerKey: string,
): void {
  for (const [name, value] of Object.entries(bounds)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Runtime layer "${vegetationLayerKey}" cullingBounds.${name} must be a non-negative finite number.`,
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
