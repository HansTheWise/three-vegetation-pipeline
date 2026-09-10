import type {
  GrassRenderProfileConfig,
  GrassRuntimeLayerConfig,
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
  if (config.configVersion !== 3) {
    throw new Error(`Unsupported runtime config version ${String(config.configVersion)}. Use version 3 with separated layer render profiles.`);
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
  validateRenderBounds(layer, label);
  if (!isRecord(layer.renderProfile)
    || typeof layer.renderProfile.type !== 'string'
    || layer.renderProfile.type.trim().length === 0) {
    throw new Error(`${label}.renderProfile.type must not be empty.`);
  }
  if (!isRecord(layer.lighting)) {
    throw new Error(`${label}.lighting must be an object.`);
  }

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

  if (layer.renderProfile.type === 'grass') {
    const grassLayer = layer as GrassRuntimeLayerConfig;
    validateGrassRenderProfile(
      grassLayer.renderProfile as GrassRenderProfileConfig,
      grassLayer,
      label,
    );
    assertBetween(
      grassLayer.lighting.directLightWeight,
      0,
      1,
      `${label}.lighting.directLightWeight`,
    );
    assertBetween(
      grassLayer.lighting.indirectLightWeight,
      0,
      1,
      `${label}.lighting.indirectLightWeight`,
    );
    validateGrassLighting(grassLayer, label);
  }

  if (typeof layer.shadows.cast !== 'boolean' || typeof layer.shadows.receive !== 'boolean') {
    throw new Error(`${label}.shadows.cast and receive must be boolean.`);
  }
}

function validateGrassLighting(layer: GrassRuntimeLayerConfig, label: string): void {
  const normal = layer.lighting.normal;
  if (!isRecord(normal)
    || (normal.source !== 'ground'
      && normal.source !== 'geometry'
      && normal.source !== 'mixed')) {
    throw new Error(`${label}.lighting.normal.source is unsupported.`);
  }
  if (normal.source === 'mixed') {
    assertBetween(normal.groundWeight, 0, 1, `${label}.lighting.normal.groundWeight`);
  }

  const transition = layer.lighting.distanceTransition;
  if (!transition) return;
  assertBetween(
    transition.directLightWeight,
    0,
    1,
    `${label}.lighting.distanceTransition.directLightWeight`,
  );
  assertBetween(
    transition.indirectLightWeight,
    0,
    1,
    `${label}.lighting.distanceTransition.indirectLightWeight`,
  );
  for (const endpoint of ['bottom', 'top'] as const) {
    const curve = transition[endpoint];
    const path = `${label}.lighting.distanceTransition.${endpoint}`;
    validateDistancePair(curve.startsAtMeters, curve.endsAtMeters, path);
    assertNonNegative(curve.curveStrength, `${path}.curveStrength`);
  }
}

function validateGrassRenderProfile(
  profile: GrassRenderProfileConfig,
  layer: VegetationRuntimeLayerConfig,
  label: string,
): void {
  const profileLabel = `${label}.renderProfile`;
  validateRange(profile.blade.heightMeters, `${profileLabel}.blade.heightMeters`, true);
  validateRange(profile.blade.widthMeters, `${profileLabel}.blade.widthMeters`, true);
  assertInteger(profile.blade.segments, `${profileLabel}.blade.segments`, 1);
  if (profile.blade.heightSampling !== 'bilinear'
    && profile.blade.heightSampling !== 'diagonal-average') {
    throw new Error(`${profileLabel}.blade.heightSampling is unsupported.`);
  }
  assertBetween(profile.blade.topWidthRatio, 0, 1, `${profileLabel}.blade.topWidthRatio`);
  assertBetween(
    profile.blade.maximumTiltDegrees,
    0,
    90,
    `${profileLabel}.blade.maximumTiltDegrees`,
  );
  validateDistancePair(
    profile.blade.cameraFacing.startsAtMeters,
    profile.blade.cameraFacing.reachesFullAtMeters,
    `${profileLabel}.blade.cameraFacing`,
  );

  const thickness = profile.bladeThicknessDistanceScaling;
  assertPositive(thickness.defaultScale, `${profileLabel}.bladeThicknessDistanceScaling.defaultScale`);
  assertPositive(thickness.maximumScale, `${profileLabel}.bladeThicknessDistanceScaling.maximumScale`);
  if (thickness.maximumScale < thickness.defaultScale) {
    throw new Error(
      `${profileLabel}.bladeThicknessDistanceScaling.maximumScale must be at least defaultScale.`,
    );
  }
  validateDistancePair(
    thickness.startsIncreasingAtMeters,
    thickness.reachesMaximumAtMeters,
    `${profileLabel}.bladeThicknessDistanceScaling`,
  );
  assertPositive(
    thickness.curveStrength,
    `${profileLabel}.bladeThicknessDistanceScaling.curveStrength`,
  );

  if (profile.colors.bottomColors.length === 0) {
    throw new Error(`${profileLabel}.colors.bottomColors must not be empty.`);
  }
  if (profile.colors.bottomColors.length > MAX_ELEMENT_COLOR_COUNT) {
    throw new Error(
      `${profileLabel}.colors.bottomColors must not contain more than ${MAX_ELEMENT_COLOR_COUNT} colors.`,
    );
  }
  profile.colors.bottomColors.forEach((color, index) => {
    validateColor(color, `${profileLabel}.colors.bottomColors[${index}]`);
  });
  if (profile.colors.topColors.length === 0) {
    throw new Error(`${profileLabel}.colors.topColors must not be empty.`);
  }
  if (profile.colors.topColors.length > MAX_ELEMENT_COLOR_COUNT) {
    throw new Error(
      `${profileLabel}.colors.topColors must not contain more than ${MAX_ELEMENT_COLOR_COUNT} colors.`,
    );
  }
  profile.colors.topColors.forEach((color, index) => {
    validateColor(color, `${profileLabel}.colors.topColors[${index}]`);
  });
  const vertical = profile.colors.verticalColorTransition;
  assertBetween(vertical.startsAtBladeRatio, 0, 1, `${profileLabel}.colors.verticalColorTransition.startsAtBladeRatio`);
  assertBetween(vertical.endsAtBladeRatio, 0, 1, `${profileLabel}.colors.verticalColorTransition.endsAtBladeRatio`);
  if (vertical.endsAtBladeRatio < vertical.startsAtBladeRatio) {
    throw new Error(`${profileLabel}.colors.verticalColorTransition must end at or after it starts.`);
  }
  const distanceColor = profile.colors.distanceColorTransition;
  if ('target' in distanceColor) {
    if (distanceColor.target !== 'ground' || !layer.patches.ground.enabled) {
      throw new Error(`${profileLabel}.colors.distanceColorTransition requires target ground and enabled ground patches.`);
    }
    for (const endpoint of ['bottom', 'top'] as const) {
      const curve = distanceColor[endpoint];
      const path = `${profileLabel}.colors.distanceColorTransition.${endpoint}`;
      validateDistancePair(curve.startsAtMeters, curve.endsAtMeters, path);
      assertNonNegative(curve.curveStrength, `${path}.curveStrength`);
    }
  } else {
    validateColor(distanceColor.farTint, `${profileLabel}.colors.distanceColorTransition.farTint`);
    validateDistancePair(
      distanceColor.startsAtMeters,
      distanceColor.endsAtMeters,
      `${profileLabel}.colors.distanceColorTransition`,
    );
    assertPositive(distanceColor.curveStrength, `${profileLabel}.colors.distanceColorTransition.curveStrength`);
  }

  const requiredHorizontalPadding = layer.distribution.elementRadiusMeters
    + Math.sin(profile.blade.maximumTiltDegrees * Math.PI / 180)
      * profile.blade.heightMeters.maximum
    + profile.blade.widthMeters.maximum
      * profile.bladeThicknessDistanceScaling.maximumScale / 2;
  if (layer.renderBounds.horizontalPaddingMeters < requiredHorizontalPadding) {
    throw new Error(
      `${label}.renderBounds.horizontalPaddingMeters does not contain the grass profile.`,
    );
  }
  if (layer.renderBounds.aboveSurfaceMeters < profile.blade.heightMeters.maximum) {
    throw new Error(
      `${label}.renderBounds.aboveSurfaceMeters does not contain the grass profile.`,
    );
  }
}

function validateRenderBounds(layer: VegetationRuntimeLayerConfig, label: string): void {
  assertNonNegative(
    layer.renderBounds.horizontalPaddingMeters,
    `${label}.renderBounds.horizontalPaddingMeters`,
  );
  assertNonNegative(
    layer.renderBounds.belowSurfaceMeters,
    `${label}.renderBounds.belowSurfaceMeters`,
  );
  assertNonNegative(
    layer.renderBounds.aboveSurfaceMeters,
    `${label}.renderBounds.aboveSurfaceMeters`,
  );
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
