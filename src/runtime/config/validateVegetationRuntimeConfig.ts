import type {
  HexColor,
  NumericRange,
  VegetationDensityCurvePoint,
  VegetationRuntimeConfig,
  VegetationRuntimeLayerConfig,
} from './types.js';
import { MAX_CELL_PATTERN_COUNT } from '../identity/CellHashLayout.js';
import { MAX_ELEMENT_COLOR_COUNT } from '../identity/ElementHashLayout.js';
import { validatePatchConfig } from '../patches/validatePatchConfig.js';
import { evaluateVegetationDensityCurve } from './evaluateVegetationDensityCurve.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Validates runtime values before modules or GPU resources consume them. */
export function validateVegetationRuntimeConfig(
  config: VegetationRuntimeConfig,
): void {
  if (config.configVersion !== 2) {
    throw new Error(`Unsupported runtime config version ${String(config.configVersion)}. Use version 2 with continuous density curves.`);
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
  validatePatchConfig(layer.patches);

  const maximumDistance = layer.visibility.maximumDistanceMeters;
  assertPositive(maximumDistance, `${label}.visibility.maximumDistanceMeters`);

  assertInteger(layer.density.renderTileSizeCells, `${label}.density.renderTileSizeCells`, 1);
  validateDensityCurve(layer.density.activeCells, `${label}.density.activeCells`);
  validateDensityCurve(layer.density.activeAnchors, `${label}.density.activeAnchors`);
  validateDensityCurve(layer.density.activeElements, `${label}.density.activeElements`);
  const densityAtVisibilityLimit = [
    layer.density.activeCells,
    layer.density.activeAnchors,
    layer.density.activeElements,
  ].map((curve) => evaluateVegetationDensityCurve(curve, maximumDistance));
  if (densityAtVisibilityLimit.every((ratio) => ratio > 0)) {
    throw new Error(`${label}.density must reach zero by visibility.maximumDistanceMeters.`);
  }

  assertInteger(layer.pattern.patternCount, `${label}.pattern.patternCount`, 1);
  if (layer.pattern.patternCount > MAX_CELL_PATTERN_COUNT) {
    throw new Error(
      `${label}.pattern.patternCount must not exceed ${MAX_CELL_PATTERN_COUNT}.`,
    );
  }
  assertInteger(layer.distribution.anchorsPerCell, `${label}.distribution.anchorsPerCell`, 1);
  assertInteger(layer.distribution.elementsPerAnchor, `${label}.distribution.elementsPerAnchor`, 1);
  assertNonNegative(layer.distribution.elementRadiusMeters, `${label}.distribution.elementRadiusMeters`);

  validateRange(layer.blade.heightMeters, `${label}.blade.heightMeters`, true);
  validateRange(layer.blade.widthMeters, `${label}.blade.widthMeters`, true);
  assertInteger(layer.blade.segments, `${label}.blade.segments`, 1);
  if (layer.blade.heightSampling !== 'bilinear'
    && layer.blade.heightSampling !== 'diagonal-average') {
    throw new Error(`${label}.blade.heightSampling is unsupported.`);
  }
  assertBetween(layer.blade.topWidthRatio, 0, 1, `${label}.blade.topWidthRatio`);
  assertBetween(layer.blade.maximumTiltDegrees, 0, 90, `${label}.blade.maximumTiltDegrees`);
  validateDistancePair(
    layer.blade.cameraFacing.startsAtMeters,
    layer.blade.cameraFacing.reachesFullAtMeters,
    `${label}.blade.cameraFacing`,
  );

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
  if ('target' in distanceColor) {
    if (distanceColor.target !== 'ground' || !layer.patches.ground.enabled) {
      throw new Error(`${label}.colors.distanceColorTransition requires target ground and enabled ground patches.`);
    }
    for (const endpoint of ['bottom', 'top'] as const) {
      const curve = distanceColor[endpoint];
      const path = `${label}.colors.distanceColorTransition.${endpoint}`;
      validateDistancePair(curve.startsAtMeters, curve.endsAtMeters, path);
      assertNonNegative(curve.curveStrength, `${path}.curveStrength`);
    }
  } else {
    validateColor(distanceColor.farTint, `${label}.colors.distanceColorTransition.farTint`);
    validateDistancePair(
      distanceColor.startsAtMeters,
      distanceColor.endsAtMeters,
      `${label}.colors.distanceColorTransition`,
    );
    assertPositive(distanceColor.curveStrength, `${label}.colors.distanceColorTransition.curveStrength`);
  }

  assertBetween(layer.lighting.directLightWeight, 0, 1, `${label}.lighting.directLightWeight`);

}

function validateDensityCurve(
  points: readonly VegetationDensityCurvePoint[],
  path: string,
): void {
  if (points.length === 0) throw new Error(`${path} must not be empty.`);
  let previousDistance = -1;
  let previousRatio = Number.POSITIVE_INFINITY;
  for (const [index, point] of points.entries()) {
    const pointPath = `${path}[${index}]`;
    assertNonNegative(point.distanceMeters, `${pointPath}.distanceMeters`);
    assertBetween(point.ratio, 0, 1, `${pointPath}.ratio`);
    if (index === 0 && point.distanceMeters !== 0) {
      throw new Error(`${path}[0].distanceMeters must be 0.`);
    }
    if (point.distanceMeters <= previousDistance) {
      throw new Error(`${path} distances must strictly increase.`);
    }
    if (point.ratio > previousRatio) {
      throw new Error(`${path} ratios must not increase with distance.`);
    }
    previousDistance = point.distanceMeters;
    previousRatio = point.ratio;
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
  path: string,
): void {
  assertNonNegative(start, `${path} start distance`);
  assertNonNegative(end, `${path} end distance`);
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
