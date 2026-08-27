import type {
  HexColor,
  NumericRange,
  VegetationRuntimeConfig,
  VegetationRuntimeLayerConfig,
} from './types.js';
import { MAX_CELL_PATTERN_COUNT } from '../identity/CellHashLayout.js';
import { MAX_ELEMENT_COLOR_COUNT } from '../identity/ElementHashLayout.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Validates runtime values before modules or GPU resources consume them. */
export function validateVegetationRuntimeConfig(
  config: VegetationRuntimeConfig,
): void {
  if (config.configVersion !== 1) {
    throw new Error(`Unsupported runtime config version ${String(config.configVersion)}.`);
  }
  if (config.assetUrl.trim().length === 0) {
    throw new Error('Runtime assetUrl must not be empty.');
  }
  if (config.layers.length === 0) {
    throw new Error('Runtime config must contain at least one vegetation layer.');
  }

  const layerIds = new Set<number>();
  const layerKeys = new Set<string>();
  for (const layer of config.layers) {
    if (layerIds.has(layer.layerId)) {
      throw new Error(`Runtime layer ID ${layer.layerId} is duplicated.`);
    }
    if (layerKeys.has(layer.key)) {
      throw new Error(`Runtime layer key "${layer.key}" is duplicated.`);
    }
    layerIds.add(layer.layerId);
    layerKeys.add(layer.key);
    validateLayer(layer);
  }
}

function validateLayer(layer: VegetationRuntimeLayerConfig): void {
  const label = `Runtime layer "${layer.key}"`;
  assertInteger(layer.layerId, `${label}.layerId`, 0);
  if (layer.key.trim().length === 0) throw new Error(`${label}.key must not be empty.`);

  const maximumDistance = layer.visibility.maximumDistanceMeters;
  assertPositive(maximumDistance, `${label}.visibility.maximumDistanceMeters`);

  assertInteger(layer.lod.renderTileSizeCells, `${label}.lod.renderTileSizeCells`, 1);
  if (layer.lod.levels.length === 0) {
    throw new Error(`${label}.lod.levels must not be empty.`);
  }

  assertInteger(layer.pattern.patternCount, `${label}.pattern.patternCount`, 1);
  if (layer.pattern.patternCount > MAX_CELL_PATTERN_COUNT) {
    throw new Error(
      `${label}.pattern.patternCount must not exceed ${MAX_CELL_PATTERN_COUNT}.`,
    );
  }
  assertInteger(layer.pattern.anchorsPerCell, `${label}.pattern.anchorsPerCell`, 1);

  validateRange(layer.blade.heightMeters, `${label}.blade.heightMeters`, true);
  validateRange(layer.blade.widthMeters, `${label}.blade.widthMeters`, true);
  assertBetween(layer.blade.topWidthRatio, 0, 1, `${label}.blade.topWidthRatio`);
  assertBetween(layer.blade.maximumTiltDegrees, 0, 90, `${label}.blade.maximumTiltDegrees`);

  assertInteger(layer.bladeCount.maximumPerAnchor, `${label}.bladeCount.maximumPerAnchor`, 1);
  validateLodLevels(layer, label);
  assertNonNegative(
    layer.bladeCount.maximumOffsetMeters,
    `${label}.bladeCount.maximumOffsetMeters`,
  );
  validateDistancePair(
    layer.bladeCount.startsDecreasingAtMeters,
    layer.bladeCount.reachesZeroAtMeters,
    maximumDistance,
    `${label}.bladeCount`,
  );
  assertPositive(layer.bladeCount.curveStrength, `${label}.bladeCount.curveStrength`);
  assertPositive(
    layer.bladeCount.growthTransitionDistanceMeters,
    `${label}.bladeCount.growthTransitionDistanceMeters`,
  );
  assertBetween(
    layer.bladeCount.lodTransitionStartVisibleRatio,
    0,
    1,
    `${label}.bladeCount.lodTransitionStartVisibleRatio`,
  );
  const bladeCountDistanceRange = layer.bladeCount.reachesZeroAtMeters
    - layer.bladeCount.startsDecreasingAtMeters;
  if (layer.bladeCount.growthTransitionDistanceMeters > bladeCountDistanceRange) {
    throw new Error(
      `${label}.bladeCount.growthTransitionDistanceMeters must not exceed the blade-count distance range.`,
    );
  }

  const thickness = layer.bladeThicknessDistanceScaling;
  assertPositive(thickness.defaultScale, `${label}.bladeThicknessDistanceScaling.defaultScale`);
  assertPositive(thickness.maximumScale, `${label}.bladeThicknessDistanceScaling.maximumScale`);
  if (thickness.maximumScale < thickness.defaultScale) {
    throw new Error(
      `${label}.bladeThicknessDistanceScaling.maximumScale must be at least defaultScale.`,
    );
  }
  validateDistancePair(
    thickness.startsIncreasingAtMeters,
    thickness.reachesMaximumAtMeters,
    maximumDistance,
    `${label}.bladeThicknessDistanceScaling`,
  );
  assertPositive(thickness.curveStrength, `${label}.bladeThicknessDistanceScaling.curveStrength`);

  if (layer.colors.bottomColors.length === 0) {
    throw new Error(`${label}.colors.bottomColors must not be empty.`);
  }
  if (layer.colors.bottomColors.length > MAX_ELEMENT_COLOR_COUNT) {
    throw new Error(
      `${label}.colors.bottomColors must not contain more than ${MAX_ELEMENT_COLOR_COUNT} colors.`,
    );
  }
  layer.colors.bottomColors.forEach((color, index) => {
    validateColor(color, `${label}.colors.bottomColors[${index}]`);
  });
  if (layer.colors.topColors.length === 0) {
    throw new Error(`${label}.colors.topColors must not be empty.`);
  }
  if (layer.colors.topColors.length > MAX_ELEMENT_COLOR_COUNT) {
    throw new Error(
      `${label}.colors.topColors must not contain more than ${MAX_ELEMENT_COLOR_COUNT} colors.`,
    );
  }
  layer.colors.topColors.forEach((color, index) => {
    validateColor(color, `${label}.colors.topColors[${index}]`);
  });
  const vertical = layer.colors.verticalColorTransition;
  assertBetween(vertical.startsAtBladeRatio, 0, 1, `${label}.colors.verticalColorTransition.startsAtBladeRatio`);
  assertBetween(vertical.endsAtBladeRatio, 0, 1, `${label}.colors.verticalColorTransition.endsAtBladeRatio`);
  if (vertical.endsAtBladeRatio < vertical.startsAtBladeRatio) {
    throw new Error(`${label}.colors.verticalColorTransition must end at or after it starts.`);
  }
  const distanceColor = layer.colors.distanceColorTransition;
  validateColor(distanceColor.farTint, `${label}.colors.distanceColorTransition.farTint`);
  validateDistancePair(
    distanceColor.startsAtMeters,
    distanceColor.endsAtMeters,
    maximumDistance,
    `${label}.colors.distanceColorTransition`,
  );
  assertPositive(distanceColor.curveStrength, `${label}.colors.distanceColorTransition.curveStrength`);

  assertBetween(layer.lighting.normalUpBias, 0, 1, `${label}.lighting.normalUpBias`);
  const facing = layer.cameraFacing;
  assertBetween(facing.topViewStartsAtDegrees, 0, 90, `${label}.cameraFacing.topViewStartsAtDegrees`);
  assertBetween(facing.topViewFullyAppliedAtDegrees, 0, 90, `${label}.cameraFacing.topViewFullyAppliedAtDegrees`);
  if (facing.topViewFullyAppliedAtDegrees < facing.topViewStartsAtDegrees) {
    throw new Error(`${label}.cameraFacing top-view transition must end at or after it starts.`);
  }
  assertBetween(facing.maximumTiltDegrees, 0, 90, `${label}.cameraFacing.maximumTiltDegrees`);

  assertBetween(layer.shadows.castUntilMeters, 0, maximumDistance, `${label}.shadows.castUntilMeters`);

  assertNonNegative(layer.wind.strength, `${label}.wind.strength`);
  assertNonNegative(layer.wind.speed, `${label}.wind.speed`);
  assertNonNegative(layer.wind.spatialFrequency, `${label}.wind.spatialFrequency`);
  assertNonNegative(layer.wind.gustStrength, `${label}.wind.gustStrength`);
  assertNonNegative(layer.wind.gustFrequency, `${label}.wind.gustFrequency`);
  assertBetween(layer.wind.variation, 0, 1, `${label}.wind.variation`);
}

function validateLodLevels(layer: VegetationRuntimeLayerConfig, label: string): void {
  let previousCellCoverageRatio = 1;
  let previousAnchorCount = layer.pattern.anchorsPerCell;
  let previousElementCount = layer.bladeCount.maximumPerAnchor;
  let previousBladeSegments = Number.POSITIVE_INFINITY;
  let previousDensity = Number.POSITIVE_INFINITY;
  for (const [index, level] of layer.lod.levels.entries()) {
    const levelPath = `${label}.lod.levels[${index}]`;
    assertPositive(level.cellCoverageRatio, `${levelPath}.cellCoverageRatio`);
    if (level.cellCoverageRatio > 1) {
      throw new Error(`${levelPath}.cellCoverageRatio must not exceed 1.`);
    }
    assertInteger(level.anchorCount, `${levelPath}.anchorCount`, 1);
    assertInteger(level.elementCount, `${levelPath}.elementCount`, 1);
    assertInteger(level.bladeSegments, `${levelPath}.bladeSegments`, 1);
    if (level.heightSampling !== 'bilinear'
      && level.heightSampling !== 'diagonal-average') {
      throw new Error(`${levelPath}.heightSampling is unsupported.`);
    }
    if (index === 0 && (
      level.cellCoverageRatio !== 1
      || level.anchorCount !== layer.pattern.anchorsPerCell
      || level.elementCount !== layer.bladeCount.maximumPerAnchor
    )) {
      throw new Error(`${label}.lod.levels[0] must use the complete Cell, Anchor and Element density.`);
    }
    if (level.cellCoverageRatio > previousCellCoverageRatio
      || level.anchorCount > previousAnchorCount
      || level.elementCount > previousElementCount
      || level.bladeSegments > previousBladeSegments) {
      throw new Error(`${label}.lod.levels must not increase density.`);
    }
    const density = level.cellCoverageRatio * level.anchorCount * level.elementCount;
    if (density >= previousDensity) {
      throw new Error(`${label}.lod.levels must strictly decrease total density.`);
    }
    previousCellCoverageRatio = level.cellCoverageRatio;
    previousAnchorCount = level.anchorCount;
    previousElementCount = level.elementCount;
    previousBladeSegments = level.bladeSegments;
    previousDensity = density;
  }
}

function validateRange(range: NumericRange, path: string, positive: boolean): void {
  if (positive) {
    assertPositive(range.minimum, `${path}.minimum`);
    assertPositive(range.maximum, `${path}.maximum`);
  }
  if (range.maximum < range.minimum) {
    throw new Error(`${path}.maximum must be at least minimum.`);
  }
}

function validateDistancePair(
  start: number,
  end: number,
  maximum: number,
  path: string,
): void {
  assertBetween(start, 0, maximum, `${path} start distance`);
  assertBetween(end, 0, maximum, `${path} end distance`);
  if (end <= start) throw new Error(`${path} end distance must be greater than start distance.`);
}

function validateColor(color: HexColor, path: string): void {
  if (!HEX_COLOR.test(color)) throw new Error(`${path} must be a six-digit hex color.`);
}

function assertInteger(value: number, path: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${path} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertPositive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${path} must be positive.`);
}

function assertNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${path} must not be negative.`);
}

function assertBetween(value: number, minimum: number, maximum: number, path: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}.`);
  }
}
