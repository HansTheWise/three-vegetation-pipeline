import type { ModelAxis } from '../../shared/vegfile-format/VegetationFileTypes.js';
import type {
  ResolvedVegetationCompilerConfig,
  ResolvedVegetationExtractionConfig,
  VegetationCompilerConfig,
  VegetationExtractionConfig,
  VegetationLayerExtractionConfig,
} from './VegetationCompilerConfig.js';

export const DEFAULT_VEGETATION_SEED = 0;

const MAX_UINT32 = 0xffff_ffff;
const MAX_GRID_RESOLUTION_PER_AXIS = 4096;
const VALID_AXES = new Set<ModelAxis>(['x', 'y', 'z']);
const VALID_HEIGHT_VALUE_BITS = new Set([8, 16, 32]);

export function resolveVegetationCompilerConfig(
  vegetationCompilerConfig: unknown,
): ResolvedVegetationCompilerConfig {
  validateVegetationCompilerConfig(vegetationCompilerConfig);
  return {
    ...vegetationCompilerConfig,
    extraction: resolveVegetationExtractionConfig(vegetationCompilerConfig.extraction),
  };
}

export function resolveVegetationExtractionConfig(
  vegetationExtractionConfig: unknown,
): ResolvedVegetationExtractionConfig {
  validateVegetationExtractionConfig(vegetationExtractionConfig);
  return {
    ...vegetationExtractionConfig,
    vegetationSeed: vegetationExtractionConfig.vegetationSeed
      ?? DEFAULT_VEGETATION_SEED,
  };
}

export function validateVegetationCompilerConfig(
  vegetationCompilerConfig: unknown,
): asserts vegetationCompilerConfig is VegetationCompilerConfig {
  const config = requireRecord(vegetationCompilerConfig, 'Vegetation compiler config');

  const glbModelReading = requireRecord(config.glbModelReading, 'glbModelReading');
  requireBoolean(
    glbModelReading.includeInvisibleObjects,
    'glbModelReading.includeInvisibleObjects',
  );

  validateVegetationExtractionConfigValue(config.extraction, 'extraction');

  const vegFileEncoding = requireRecord(config.vegFileEncoding, 'vegFileEncoding');
  if (!VALID_HEIGHT_VALUE_BITS.has(vegFileEncoding.heightValueBits as number)) {
    throw new Error('vegFileEncoding.heightValueBits must be 8, 16 or 32.');
  }
}

export function validateVegetationExtractionConfig(
  vegetationExtractionConfig: unknown,
): asserts vegetationExtractionConfig is VegetationExtractionConfig {
  validateVegetationExtractionConfigValue(
    vegetationExtractionConfig,
    'Vegetation extraction config',
  );
}

function validateVegetationExtractionConfigValue(candidate: unknown, path: string): void {
  const extraction = requireRecord(candidate, path);
  const coordinateSystem = requireRecord(
    extraction.coordinateSystem,
    `${path}.coordinateSystem`,
  );
  const upAxis = requireAxis(coordinateSystem.upAxis, `${path}.coordinateSystem.upAxis`);
  const horizontalAxes = requireArray(
    coordinateSystem.horizontalAxes,
    `${path}.coordinateSystem.horizontalAxes`,
  );
  if (horizontalAxes.length !== 2) {
    throw new Error(`${path}.coordinateSystem.horizontalAxes must contain exactly two axes.`);
  }
  const axes = [
    upAxis,
    requireAxis(horizontalAxes[0], `${path}.coordinateSystem.horizontalAxes[0]`),
    requireAxis(horizontalAxes[1], `${path}.coordinateSystem.horizontalAxes[1]`),
  ];
  if (new Set(axes).size !== 3) throw new Error('Coordinate axes must be unique.');
  requirePositiveNumber(
    coordinateSystem.unitsPerMeter,
    `${path}.coordinateSystem.unitsPerMeter`,
  );

  if (extraction.vegetationSeed !== undefined) {
    requireUint32(extraction.vegetationSeed, `${path}.vegetationSeed`);
  }
  const grid = requireRecord(extraction.grid, `${path}.grid`);
  requirePositiveNumber(grid.chunkSize, `${path}.grid.chunkSize`);

  const heightMap = requireRecord(extraction.heightMap, `${path}.heightMap`);
  validateResolution(
    heightMap.resolutionPerChunkAxis,
    `${path}.heightMap.resolutionPerChunkAxis`,
    2,
  );
  validateModelSurfaceSelection(
    heightMap.sourceSurfaceSelection,
    `${path}.heightMap.sourceSurfaceSelection`,
  );
  requireBoolean(
    extraction.allowVegetationLayerOverlap,
    `${path}.allowVegetationLayerOverlap`,
  );

  const vegetationLayers = requireArray(
    extraction.vegetationLayers,
    `${path}.vegetationLayers`,
  );
  if (vegetationLayers.length === 0) {
    throw new Error(`${path}.vegetationLayers must contain at least one layer.`);
  }
  for (let index = 0; index < vegetationLayers.length; index += 1) {
    validateVegetationLayerExtractionConfig(
      vegetationLayers[index],
      `${path}.vegetationLayers[${index}]`,
    );
  }
  const typedLayers = vegetationLayers as unknown as VegetationLayerExtractionConfig[];
  if (new Set(typedLayers.map((layer) => layer.vegetationLayerId)).size !== typedLayers.length) {
    throw new Error('Vegetation layer IDs must be unique.');
  }
  if (new Set(typedLayers.map((layer) => layer.vegetationLayerKey)).size !== typedLayers.length) {
    throw new Error('Vegetation layer keys must be unique.');
  }
}

function validateVegetationLayerExtractionConfig(candidate: unknown, path: string): void {
  const layer = requireRecord(candidate, path);
  requireUint32(layer.vegetationLayerId, `${path}.vegetationLayerId`);
  requireNonEmptyString(layer.vegetationLayerKey, `${path}.vegetationLayerKey`);
  validateResolution(
    layer.maskResolutionPerChunkAxis,
    `${path}.maskResolutionPerChunkAxis`,
    1,
  );
  validateModelSurfaceSelection(layer.includedSurfaceSelection, `${path}.includedSurfaceSelection`);
  if (layer.excludedSurfaceSelection !== undefined) {
    validateModelSurfaceSelection(layer.excludedSurfaceSelection, `${path}.excludedSurfaceSelection`);
  }
  const filters = requireRecord(layer.filters, `${path}.filters`);
  const maximumSlopeDegrees = requireFiniteNumber(
    filters.maximumSlopeDegrees,
    `${path}.filters.maximumSlopeDegrees`,
  );
  if (maximumSlopeDegrees < 0 || maximumSlopeDegrees > 90) {
    throw new Error(`${path}.filters.maximumSlopeDegrees must be between 0 and 90.`);
  }
}

function validateModelSurfaceSelection(candidate: unknown, path: string): void {
  const selection = requireRecord(candidate, path);
  const hasMatchAny = Object.hasOwn(selection, 'matchAny');
  const hasMatchAll = Object.hasOwn(selection, 'matchAll');
  if (hasMatchAny === hasMatchAll) {
    throw new Error(`${path} must contain exactly one of matchAny or matchAll.`);
  }
  const ruleProperty = hasMatchAll ? 'matchAll' : 'matchAny';
  const rules = requireArray(selection[ruleProperty], `${path}.${ruleProperty}`);
  if (rules.length === 0) throw new Error(`${path} must contain at least one rule.`);
  for (let index = 0; index < rules.length; index += 1) {
    validateModelSurfaceNameRule(rules[index], `${path}.${ruleProperty}[${index}]`);
  }
}

function validateModelSurfaceNameRule(candidate: unknown, path: string): void {
  const rule = requireRecord(candidate, path);
  const property = rule.property;
  if (
    property !== 'hierarchyNodeName'
    && property !== 'hierarchyNodeNamePrefix'
    && property !== 'materialName'
  ) {
    throw new Error(`${path}.property is not a supported model surface property.`);
  }
  requireBoolean(rule.caseSensitive, `${path}.caseSensitive`);
  const collectionProperty = property === 'hierarchyNodeNamePrefix'
    ? 'acceptedPrefixes'
    : 'acceptedNames';
  const acceptedNames = requireArray(rule[collectionProperty], `${path}.${collectionProperty}`);
  if (acceptedNames.length === 0) {
    throw new Error(`${path}.${collectionProperty} must contain at least one name.`);
  }
  for (let index = 0; index < acceptedNames.length; index += 1) {
    requireNonEmptyString(acceptedNames[index], `${path}.${collectionProperty}[${index}]`);
  }
}

function requireRecord(candidate: unknown, path: string): Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`${path} must be an object.`);
  }
  return candidate as Record<string, unknown>;
}

function requireArray(candidate: unknown, path: string): unknown[] {
  if (!Array.isArray(candidate)) throw new Error(`${path} must be an array.`);
  return candidate;
}

function requireAxis(candidate: unknown, path: string): ModelAxis {
  if (typeof candidate !== 'string' || !VALID_AXES.has(candidate as ModelAxis)) {
    throw new Error(`${path} must be x, y or z.`);
  }
  return candidate as ModelAxis;
}

function requireBoolean(candidate: unknown, path: string): boolean {
  if (typeof candidate !== 'boolean') throw new Error(`${path} must be a boolean.`);
  return candidate;
}

function requireNonEmptyString(candidate: unknown, path: string): string {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return candidate;
}

function requireFiniteNumber(candidate: unknown, path: string): number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return candidate;
}

function requirePositiveNumber(candidate: unknown, path: string): number {
  const value = requireFiniteNumber(candidate, path);
  if (value <= 0) throw new Error(`${path} must be greater than zero.`);
  return value;
}

function requireUint32(candidate: unknown, path: string): number {
  const value = requireFiniteNumber(candidate, path);
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new Error(`${path} must be an unsigned 32-bit integer.`);
  }
  return value;
}

function validateResolution(candidate: unknown, path: string, minimum: number): void {
  const value = requireFiniteNumber(candidate, path);
  if (!Number.isInteger(value) || value < minimum || value > MAX_GRID_RESOLUTION_PER_AXIS) {
    throw new Error(
      `${path} must be an integer between ${minimum} and ${MAX_GRID_RESOLUTION_PER_AXIS}.`,
    );
  }
}
