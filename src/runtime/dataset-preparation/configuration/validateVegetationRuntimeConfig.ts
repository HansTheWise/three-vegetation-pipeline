import type {
  VegetationRuntimeConfig,
  VegetationRuntimeLayerConfig,
} from './VegetationRuntimeConfig.js';

export type VegetationRuntimeLayerConfigValidator = Readonly<{
  profileType: string;
  validateConfig?(config: VegetationRuntimeLayerConfig): void;
}>;

/** Validates profile-independent runtime values before profiles consume them. */
export function validateVegetationRuntimeConfig(
  config: VegetationRuntimeConfig,
  validators: readonly VegetationRuntimeLayerConfigValidator[] = [],
): void {
  if (config.configVersion !== 3) {
    throw new Error(`Unsupported runtime config version ${String(config.configVersion)}. Use version 3 with separated layer render profiles.`);
  }
  if (config.layers.length === 0) {
    throw new Error('Runtime config must contain at least one vegetation layer.');
  }

  const vegetationLayerIds = new Set<number>();
  const vegetationLayerKeys = new Set<string>();
  const validatorsByProfileType = new Map(
    validators.map((validator) => [validator.profileType, validator]),
  );
  for (const layer of config.layers) {
    if (vegetationLayerIds.has(layer.vegetationLayerId)) {
      throw new Error(`Runtime layer ID ${layer.vegetationLayerId} is duplicated.`);
    }
    if (vegetationLayerKeys.has(layer.vegetationLayerKey)) {
      throw new Error(`Runtime layer key "${layer.vegetationLayerKey}" is duplicated.`);
    }
    vegetationLayerIds.add(layer.vegetationLayerId);
    vegetationLayerKeys.add(layer.vegetationLayerKey);
    validateRuntimeLayerIdentity(layer);
    if (layer.enabled) {
      validatorsByProfileType.get(layer.renderProfile.type)?.validateConfig?.(layer);
    }
  }
}

function validateRuntimeLayerIdentity(layer: VegetationRuntimeLayerConfig): void {
  const label = `Runtime layer "${layer.vegetationLayerKey}"`;
  if (!Number.isInteger(layer.vegetationLayerId)
    || layer.vegetationLayerId < 0
    || layer.vegetationLayerId > 0xffff_ffff) {
    throw new Error(`${label}.vegetationLayerId must be an unsigned 32-bit integer.`);
  }
  if (layer.vegetationLayerKey.trim().length === 0) {
    throw new Error(`${label}.vegetationLayerKey must not be empty.`);
  }
  if (typeof layer.enabled !== 'boolean') {
    throw new Error(`${label}.enabled must be boolean.`);
  }
  if (!isRecord(layer.renderProfile)
    || typeof layer.renderProfile.type !== 'string'
    || layer.renderProfile.type.trim().length === 0) {
    throw new Error(`${label}.renderProfile.type must not be empty.`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
