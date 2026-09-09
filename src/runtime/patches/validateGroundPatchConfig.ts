import type {
  EnabledGroundPatchConfig,
  GroundPatchConfig,
} from './types.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function validateGroundPatchConfig(
  config: GroundPatchConfig,
): void {
  if (!config.enabled) return;
  validateEnabledConfig(config);
}

function validateEnabledConfig(config: EnabledGroundPatchConfig): void {
  assertUint32(config.seed, 'Vegetation patches.seed');
  assertPositive(config.radiusMeters.minimum, 'Vegetation patches.radiusMeters.minimum');
  assertPositive(config.radiusMeters.maximum, 'Vegetation patches.radiusMeters.maximum');
  if (config.radiusMeters.maximum < config.radiusMeters.minimum) {
    throw new Error(
      'Vegetation patches.radiusMeters.maximum must be at least minimum.',
    );
  }
  assertBetween(config.targetCoverage, 0, 1, 'Vegetation patches.targetCoverage');
  assertNonNegative(config.edgeFalloffMeters, 'Vegetation patches.edgeFalloffMeters');
  assertBetween(config.shapeDistortion, 0, 1, 'Vegetation patches.shapeDistortion');
  if (!HEX_COLOR.test(config.colors.baseColor)) {
    throw new Error('Vegetation patches.colors.baseColor must be a six-digit hex color.');
  }
  assertBetween(
    config.colors.brightnessVariation,
    0,
    1,
    'Vegetation patches.colors.brightnessVariation',
  );
}

function assertUint32(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${path} must be an unsigned 32-bit integer.`);
  }
}

function assertPositive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be positive.`);
  }
}

function assertNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must not be negative.`);
  }
}

function assertBetween(
  value: number,
  minimum: number,
  maximum: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}.`);
  }
}
