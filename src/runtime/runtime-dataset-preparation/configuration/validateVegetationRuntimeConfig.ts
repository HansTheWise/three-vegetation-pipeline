import type {
  VegetationRuntimeConfig,
  VegetationRuntimeLayerConfig,
} from './VegetationRuntimeConfig.js';

export type VegetationLayerConfigValidator = Readonly<{
  profileType: string;
  validateConfig?(config: VegetationRuntimeLayerConfig): void;
}>;

/** Validates profile-independent runtime values before modules consume them. */
export function validateVegetationRuntimeConfig(
  config: VegetationRuntimeConfig,
  validators: readonly VegetationLayerConfigValidator[] = [],
): void {
  if (config.configVersion !== 3) {
    throw new Error(`Unsupported runtime config version ${String(config.configVersion)}. Use version 3 with separated layer render profiles.`);
  }
  if (config.layers.length === 0) {
    throw new Error('Runtime config must contain at least one vegetation layer.');
  }

  const layerIds = new Set<number>();
  const layerKeys = new Set<string>();
  const validatorsByProfileType = new Map(
    validators.map((validator) => [validator.profileType, validator]),
  );
  for (const layer of config.layers) {
    if (layerIds.has(layer.layerId)) {
      throw new Error(`Runtime layer ID ${layer.layerId} is duplicated.`);
    }
    if (layerKeys.has(layer.key)) {
      throw new Error(`Runtime layer key "${layer.key}" is duplicated.`);
    }
    layerIds.add(layer.layerId);
    layerKeys.add(layer.key);
    validateRuntimeLayerIdentity(layer);
    if (layer.enabled) {
      validatorsByProfileType.get(layer.renderProfile.type)?.validateConfig?.(layer);
    }
  }
}

function validateRuntimeLayerIdentity(layer: VegetationRuntimeLayerConfig): void {
  const label = `Runtime layer "${layer.key}"`;
  if (!Number.isInteger(layer.layerId) || layer.layerId < 0) {
    throw new Error(`${label}.layerId must be an integer greater than or equal to 0.`);
  }
  if (layer.key.trim().length === 0) throw new Error(`${label}.key must not be empty.`);
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
