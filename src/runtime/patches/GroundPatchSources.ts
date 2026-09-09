import type { ParsedVegFile, ParsedVegLayer } from '../parser/types.js';
import type { PatchFieldGeometry } from './GroundPatchFieldGeometry.js';
import { isVegetationAllowedAtMeters } from './GroundPatchFieldGeometry.js';
import {
  combinePatchDistances,
  coverageFromDistance,
  createPatchRandomNumberGenerator,
  patchSourceExtent,
  evaluatePatchDistance,
  warpPatchPosition,
  type PatchSource,
} from './GroundPatchNoise.js';
import type { EnabledGroundPatchConfig } from './types.js';

const MAX_COVERAGE_MEASUREMENT_SAMPLES = 16_384;
const MAX_CONSECUTIVE_PLACEMENT_REJECTIONS = 1_024;

export function createPatchSources(
  file: ParsedVegFile,
  layer: ParsedVegLayer,
  config: EnabledGroundPatchConfig,
  geometry: PatchFieldGeometry,
  eligiblePixelIndices: readonly number[],
  seed: number,
): PatchSource[] {
  const measurementPositions = createMeasurementPositions(
    geometry,
    eligiblePixelIndices,
    config,
    seed,
  );
  const distances = new Float64Array(measurementPositions.length / 2);
  distances.fill(Number.POSITIVE_INFINITY);
  let coverageSum = 0;
  let measuredCoverage = 0;
  const sources: PatchSource[] = [];
  const sourceBuckets = new Map<string, PatchSource[]>();
  const bucketSizeMeters = config.radiusMeters.maximum * 2.5;
  const random = createPatchRandomNumberGenerator(seed);
  const eligibleArea = eligiblePixelIndices.length
    * geometry.texelSizeMeters * geometry.texelSizeMeters;
  const minimumPatchArea = Math.PI
    * config.radiusMeters.minimum * config.radiusMeters.minimum;
  const maximumPatchCount = Math.max(
    1,
    Math.min(
      eligiblePixelIndices.length,
      Math.ceil(eligibleArea / minimumPatchArea * 8) + 32,
    ),
  );
  const maximumAttempts = maximumPatchCount * 64;
  let consecutiveRejections = 0;

  for (let attempt = 0;
    attempt < maximumAttempts && sources.length < maximumPatchCount;
    attempt += 1) {
    const candidate = createPatchCandidate(
      file,
      layer,
      config,
      geometry,
      eligiblePixelIndices,
      random,
      seed,
    );
    if (!canPlacePatch(candidate, sourceBuckets, bucketSizeMeters, config)) {
      consecutiveRejections += 1;
      if (consecutiveRejections >= MAX_CONSECUTIVE_PLACEMENT_REJECTIONS) break;
      continue;
    }
    consecutiveRejections = 0;

    let nextCoverageSum = coverageSum;
    const candidateExtent = patchSourceExtent(candidate)
      + (config.allowMerging ? config.radiusMeters.minimum * 0.25 : 0);
    const firstSample = firstMeasurementAtX(measurementPositions, candidate.centerX - candidateExtent);
    for (let sampleIndex = firstSample;
      sampleIndex < distances.length
        && measurementPositions[sampleIndex * 2]! <= candidate.centerX + candidateExtent;
      sampleIndex += 1) {
      const positionOffset = sampleIndex * 2;
      const deltaX = measurementPositions[positionOffset]! - candidate.centerX;
      const deltaY = measurementPositions[positionOffset + 1]! - candidate.centerY;
      if (deltaX * deltaX + deltaY * deltaY > candidateExtent * candidateExtent) continue;
      const candidateDistance = evaluatePatchDistance(
        measurementPositions[positionOffset]!,
        measurementPositions[positionOffset + 1]!,
        candidate,
      );
      const distance = combinePatchDistances(
        distances[sampleIndex]!,
        candidateDistance,
        config,
      );
      nextCoverageSum += coverageFromDistance(distance, config.edgeFalloffMeters)
        - coverageFromDistance(distances[sampleIndex]!, config.edgeFalloffMeters);
      // If the final candidate is rejected below, these distances are no longer used.
      distances[sampleIndex] = distance;
    }

    const nextCoverage = nextCoverageSum / distances.length;
    const previousDifference = Math.abs(measuredCoverage - config.targetCoverage);
    const nextDifference = Math.abs(nextCoverage - config.targetCoverage);
    if (nextCoverage >= config.targetCoverage
      && previousDifference <= nextDifference) {
      break;
    }

    sources.push(candidate);
    const bucketKey = `${Math.floor(candidate.centerX / bucketSizeMeters)},${Math.floor(candidate.centerY / bucketSizeMeters)}`;
    const bucket = sourceBuckets.get(bucketKey);
    if (bucket) bucket.push(candidate);
    else sourceBuckets.set(bucketKey, [candidate]);
    coverageSum = nextCoverageSum;
    measuredCoverage = nextCoverage;
    if (measuredCoverage >= config.targetCoverage) break;
  }

  return sources;
}

function createMeasurementPositions(
  geometry: PatchFieldGeometry,
  eligiblePixelIndices: readonly number[],
  config: EnabledGroundPatchConfig,
  seed: number,
): Float64Array {
  const sampleCount = Math.min(
    eligiblePixelIndices.length,
    MAX_COVERAGE_MEASUREMENT_SAMPLES,
  );
  const positions = new Float64Array(sampleCount * 2);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const eligibleIndex = Math.min(
      eligiblePixelIndices.length - 1,
      Math.floor(sampleIndex * eligiblePixelIndices.length / sampleCount),
    );
    const pixelIndex = eligiblePixelIndices[eligibleIndex]!;
    const pixelX = pixelIndex % geometry.width;
    const pixelY = Math.floor(pixelIndex / geometry.width);
    const position = warpPatchPosition(
      geometry.originMetersX + (pixelX + 0.5) * geometry.texelSizeMeters,
      geometry.originMetersY + (pixelY + 0.5) * geometry.texelSizeMeters,
      config, seed,
    );
    positions[sampleIndex * 2] = position.x;
    positions[sampleIndex * 2 + 1] = position.y;
  }
  // One sorted axis bounds each candidate's measurement range without rescanning
  // the whole campus or allocating another full distance array per candidate.
  const order = Array.from({ length: sampleCount }, (_, index) => index)
    .sort((left, right) => positions[left * 2]! - positions[right * 2]!);
  return Float64Array.from({ length: positions.length }, (_, index) => (
    positions[order[Math.floor(index / 2)]! * 2 + index % 2]!
  ));
}

function firstMeasurementAtX(positions: Float64Array, x: number): number {
  let start = 0;
  let end = positions.length / 2;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (positions[middle * 2]! < x) start = middle + 1;
    else end = middle;
  }
  return start;
}

function createPatchCandidate(
  file: ParsedVegFile,
  layer: ParsedVegLayer,
  config: EnabledGroundPatchConfig,
  geometry: PatchFieldGeometry,
  eligiblePixelIndices: readonly number[],
  random: () => number,
  seed: number,
): PatchSource {
  const pixelIndex = eligiblePixelIndices[
    Math.floor(random() * eligiblePixelIndices.length)
  ]!;
  const pixelX = pixelIndex % geometry.width;
  const pixelY = Math.floor(pixelIndex / geometry.width);
  const centerPixelX = geometry.originMetersX
    + (pixelX + 0.5) * geometry.texelSizeMeters;
  const centerPixelY = geometry.originMetersY
    + (pixelY + 0.5) * geometry.texelSizeMeters;
  const jitteredX = centerPixelX + (random() - 0.5) * geometry.texelSizeMeters;
  const jitteredY = centerPixelY + (random() - 0.5) * geometry.texelSizeMeters;
  const centerIsEligible = isVegetationAllowedAtMeters(
    file,
    layer,
    jitteredX,
    jitteredY,
  );
  const radiusMeters = interpolate(
    config.radiusMeters.minimum,
    config.radiusMeters.maximum,
    random(),
  );
  const rotation = random() * Math.PI * 2;
  const center = warpPatchPosition(
    centerIsEligible ? jitteredX : centerPixelX,
    centerIsEligible ? jitteredY : centerPixelY,
    config, seed,
  );
  return {
    centerX: center.x,
    centerY: center.y,
    radiusMeters,
    stretch: interpolate(0.8, 1.25, random()),
    cosine: Math.cos(rotation),
    sine: Math.sin(rotation),
    colorVariation: random() * 2 - 1,
  };
}

function canPlacePatch(
  candidate: PatchSource,
  buckets: ReadonlyMap<string, readonly PatchSource[]>,
  bucketSizeMeters: number,
  config: EnabledGroundPatchConfig,
): boolean {
  const candidateExtent = patchSourceExtent(candidate);
  // Generated stretches are in [0.8, 1.25], so no source exceeds 1.25 * max radius.
  const searchRadius = config.allowMerging
    ? candidate.radiusMeters * 0.35
    : candidateExtent + config.radiusMeters.maximum * 1.25;
  const minimumX = Math.floor((candidate.centerX - searchRadius) / bucketSizeMeters);
  const maximumX = Math.floor((candidate.centerX + searchRadius) / bucketSizeMeters);
  const minimumY = Math.floor((candidate.centerY - searchRadius) / bucketSizeMeters);
  const maximumY = Math.floor((candidate.centerY + searchRadius) / bucketSizeMeters);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const sources = buckets.get(`${x},${y}`);
      if (!sources) continue;
      for (const source of sources) {
        const centerDistance = Math.hypot(
          candidate.centerX - source.centerX,
          candidate.centerY - source.centerY,
        );
        const minimumDistance = config.allowMerging
          ? Math.min(candidate.radiusMeters, source.radiusMeters) * 0.35
          : candidateExtent + patchSourceExtent(source);
        if (centerDistance < minimumDistance) return false;
      }
    }
  }
  return true;
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}
