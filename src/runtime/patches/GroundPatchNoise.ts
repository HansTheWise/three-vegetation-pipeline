import { mixVegetationHash } from '../identity/VegetationIds.js';
import type { EnabledGroundPatchConfig } from './types.js';

const PATCH_WARP_X_SALT = 0x12f9_15e5;
const PATCH_WARP_Y_SALT = 0x54d3_a4b1;
const PATCH_COLOR_NOISE_SALT = 0x7b7d_159c;

export type PatchSource = Readonly<{
  centerX: number;
  centerY: number;
  radiusMeters: number;
  stretch: number;
  cosine: number;
  sine: number;
  colorVariation: number;
}>;

export type PatchFieldValue = Readonly<{
  coverage: number;
  colorVariation: number;
}>;

export function evaluatePatchFieldValue(
  positionX: number,
  positionY: number,
  sources: readonly PatchSource[],
  config: EnabledGroundPatchConfig,
  seed: number,
): PatchFieldValue {
  let combinedDistance = Number.POSITIVE_INFINITY;
  let weightedColor = 0;
  let colorWeight = 0;
  for (const source of sources) {
    const extent = patchSourceExtent(source)
      + (config.allowMerging ? config.radiusMeters.minimum * 0.25 : 0);
    const deltaX = positionX - source.centerX;
    const deltaY = positionY - source.centerY;
    if (deltaX * deltaX + deltaY * deltaY > extent * extent) continue;
    const distance = evaluatePatchDistance(
      positionX,
      positionY,
      source,
    );
    combinedDistance = combinePatchDistances(combinedDistance, distance, config);
    const weight = coverageFromDistance(distance, config.edgeFalloffMeters);
    weightedColor += source.colorVariation * weight;
    colorWeight += weight;
  }

  const coverage = coverageFromDistance(combinedDistance, config.edgeFalloffMeters);
  if (coverage === 0) return { coverage: 0, colorVariation: 0 };

  const colorNoiseScale = 1 / (config.radiusMeters.maximum * 4);
  const colorNoise = gradientNoise2d(
    positionX * colorNoiseScale,
    positionY * colorNoiseScale,
    mixVegetationHash(seed ^ PATCH_COLOR_NOISE_SALT),
  );
  // The ground multiplies G by union coverage (R). Normalize against at least
  // that coverage so individual source edges fade to base even in union bridges.
  const normalization = Math.max(coverage, colorWeight);
  return {
    coverage,
    colorVariation: clamp(
      (weightedColor * 0.85 + colorNoise * 0.15 * colorWeight) / normalization,
      -1,
      1,
    ),
  };
}

export function evaluatePatchDistance(
  positionX: number,
  positionY: number,
  source: PatchSource,
): number {
  const deltaX = positionX - source.centerX;
  const deltaY = positionY - source.centerY;
  const rotatedX = source.cosine * deltaX + source.sine * deltaY;
  const rotatedY = -source.sine * deltaX + source.cosine * deltaY;
  return Math.hypot(
    rotatedX / source.stretch,
    rotatedY * source.stretch,
  ) - source.radiusMeters;
}

/** Shared domain warp: evaluated once per field sample, never once per source. */
export function warpPatchPosition(
  x: number,
  y: number,
  config: EnabledGroundPatchConfig,
  seed: number,
): Readonly<{ x: number; y: number }> {
  if (config.shapeDistortion === 0) return { x, y };
  const broadScale = config.radiusMeters.maximum * 2;
  const detailScale = config.radiusMeters.minimum * 2;
  const broadAmplitude = config.radiusMeters.maximum * 1.5 * config.shapeDistortion;
  const detailAmplitude = config.radiusMeters.minimum * 0.8 * config.shapeDistortion;
  return {
    x: x + gradientNoise2d(x / broadScale, y / broadScale, seed ^ PATCH_WARP_X_SALT) * broadAmplitude
      + gradientNoise2d(x / detailScale, y / detailScale, seed ^ PATCH_WARP_Y_SALT) * detailAmplitude,
    y: y + gradientNoise2d(x / broadScale, y / broadScale, seed ^ PATCH_WARP_Y_SALT) * broadAmplitude
      + gradientNoise2d(x / detailScale, y / detailScale, seed ^ PATCH_WARP_X_SALT) * detailAmplitude,
  };
}

export function combinePatchDistances(
  currentDistance: number,
  candidateDistance: number,
  config: EnabledGroundPatchConfig,
): number {
  if (!Number.isFinite(currentDistance) || !config.allowMerging) {
    return Math.min(currentDistance, candidateDistance);
  }
  const smoothingMeters = config.radiusMeters.minimum * 0.2;
  const blend = clamp(
    0.5 + 0.5 * (candidateDistance - currentDistance) / smoothingMeters,
    0,
    1,
  );
  return interpolate(candidateDistance, currentDistance, blend)
    - smoothingMeters * blend * (1 - blend);
}

export function coverageFromDistance(
  distance: number,
  edgeFalloffMeters: number,
): number {
  if (distance >= 0) return 0;
  if (edgeFalloffMeters === 0 || distance <= -edgeFalloffMeters) return 1;
  const ratio = -distance / edgeFalloffMeters;
  return ratio * ratio * (3 - 2 * ratio);
}

export function patchSourceExtent(source: PatchSource): number {
  const maximumAxisScale = Math.max(source.stretch, 1 / source.stretch);
  return source.radiusMeters * maximumAxisScale;
}

export function createPatchRandomNumberGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function gradientNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fractionX = x - x0;
  const fractionY = y - y0;
  const fadeX = fade(fractionX);
  const fadeY = fade(fractionY);
  const lower = interpolate(
    gradientDot(seed, x0, y0, fractionX, fractionY),
    gradientDot(seed, x0 + 1, y0, fractionX - 1, fractionY),
    fadeX,
  );
  const upper = interpolate(
    gradientDot(seed, x0, y0 + 1, fractionX, fractionY - 1),
    gradientDot(seed, x0 + 1, y0 + 1, fractionX - 1, fractionY - 1),
    fadeX,
  );
  return clamp(interpolate(lower, upper, fadeY), -1, 1);
}

function gradientDot(
  seed: number,
  latticeX: number,
  latticeY: number,
  deltaX: number,
  deltaY: number,
): number {
  const hash = mixVegetationHash(
    seed
      ^ Math.imul(latticeX, 0x85eb_ca6b)
      ^ Math.imul(latticeY, 0xc2b2_ae35),
  );
  switch (hash & 7) {
    case 0: return deltaX;
    case 1: return -deltaX;
    case 2: return deltaY;
    case 3: return -deltaY;
    case 4: return (deltaX + deltaY) * Math.SQRT1_2;
    case 5: return (deltaX - deltaY) * Math.SQRT1_2;
    case 6: return (-deltaX + deltaY) * Math.SQRT1_2;
    default: return (-deltaX - deltaY) * Math.SQRT1_2;
  }
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
