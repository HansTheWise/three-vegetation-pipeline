import { mixVegetationHash } from '../identity/VegetationIds.js';
import type { ParsedVegFile } from '../parser/types.js';
import {
  collectEligiblePatchPixels,
  createPatchFieldGeometry,
  type PatchFieldGeometry,
} from './GroundPatchFieldGeometry.js';
import {
  patchSourceExtent,
  evaluatePatchFieldValue,
  warpPatchPosition,
  type PatchSource,
} from './GroundPatchNoise.js';
import { createPatchSources } from './GroundPatchSources.js';
import type {
  EnabledGroundPatchConfig,
  GroundPatchConfig,
  GroundPatchField,
  GroundPatchFieldSample,
} from './types.js';
import { validateGroundPatchConfig } from './validateGroundPatchConfig.js';

const MAX_PATCH_FIELD_CHANNEL_VALUES = 0x7fff_ffff;
const PATCH_LAYER_SEED_SALT = 0x6ac6_90c5;
const NEUTRAL_COLOR_VARIATION_BYTE = 128;

type PatchSpatialIndex = Readonly<{
  buckets: readonly (readonly PatchSource[])[];
  width: number;
  height: number;
  bucketSizeMeters: number;
}>;

/**
 * Builds a color-only, renderer-independent ground field for a VEGFILE layer.
 * Disabled configs return no allocation and do not inspect the requested layer.
 */
export function createGroundPatchField(
  file: ParsedVegFile,
  layerId: number,
  config: GroundPatchConfig,
): GroundPatchField | undefined {
  validateGroundPatchConfig(config);
  if (!config.enabled) return undefined;

  const layer = file.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`VEGFILE layer ${layerId} does not exist.`);

  const geometry = createPatchFieldGeometry(file, config);
  const pixelCount = geometry.width * geometry.height;
  if (!Number.isSafeInteger(pixelCount)
    || pixelCount * 2 > MAX_PATCH_FIELD_CHANNEL_VALUES) {
    throw new Error('Vegetation patch field dimensions exceed the supported RG8 allocation.');
  }

  const data = createEmptyPatchData(pixelCount);
  const eligiblePixelIndices = collectEligiblePatchPixels(file, layer, geometry);
  if (eligiblePixelIndices.length === 0 || config.targetCoverage === 0) {
    return createFieldResult(
      file,
      layerId,
      config,
      geometry,
      data,
      0,
      eligiblePixelIndices.length,
      0,
    );
  }

  const seed = mixVegetationHash(
    file.header.seed
      ^ config.seed
      ^ Math.imul(layerId + 1, PATCH_LAYER_SEED_SALT),
  );
  const sources = createPatchSources(
    file,
    layer,
    config,
    geometry,
    eligiblePixelIndices,
    seed,
  );
  const achievedCoverage = rasterizePatchField(
    data,
    eligiblePixelIndices,
    geometry,
    sources,
    config,
    seed,
  );

  return createFieldResult(
    file,
    layerId,
    config,
    geometry,
    data,
    sources.length,
    eligiblePixelIndices.length,
    achievedCoverage,
  );
}

/** Bilinearly samples the quantized field at a position in model units. */
export function sampleGroundPatchField(
  field: GroundPatchField,
  modelX: number,
  modelY: number,
): GroundPatchFieldSample {
  if (!Number.isFinite(modelX) || !Number.isFinite(modelY)) {
    throw new Error('Vegetation patch sample coordinates must be finite.');
  }
  const maximumX = field.originX + field.width * field.texelSizeUnits;
  const maximumY = field.originY + field.height * field.texelSizeUnits;
  if (modelX < field.originX || modelX >= maximumX
    || modelY < field.originY || modelY >= maximumY) {
    return {
      coverageByte: 0,
      colorVariationByte: NEUTRAL_COLOR_VARIATION_BYTE,
    };
  }

  const sampleX = clamp(
    (modelX - field.originX) / field.texelSizeUnits - 0.5,
    0,
    field.width - 1,
  );
  const sampleY = clamp(
    (modelY - field.originY) / field.texelSizeUnits - 0.5,
    0,
    field.height - 1,
  );
  return {
    coverageByte: sampleFieldChannel(field, sampleX, sampleY, 0),
    colorVariationByte: sampleFieldChannel(field, sampleX, sampleY, 1),
  };
}

function createEmptyPatchData(pixelCount: number): Uint8Array {
  const data = new Uint8Array(pixelCount * 2);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    data[pixelIndex * 2 + 1] = NEUTRAL_COLOR_VARIATION_BYTE;
  }
  return data;
}

function rasterizePatchField(
  data: Uint8Array,
  eligiblePixelIndices: readonly number[],
  geometry: PatchFieldGeometry,
  sources: readonly PatchSource[],
  config: EnabledGroundPatchConfig,
  seed: number,
): number {
  if (sources.length === 0) return 0;
  const spatialIndex = createPatchSpatialIndex(sources, config, geometry);
  let coverageSum = 0;
  for (const pixelIndex of eligiblePixelIndices) {
    const pixelX = pixelIndex % geometry.width;
    const pixelY = Math.floor(pixelIndex / geometry.width);
    const positionX = geometry.originMetersX
      + (pixelX + 0.5) * geometry.texelSizeMeters;
    const positionY = geometry.originMetersY
      + (pixelY + 0.5) * geometry.texelSizeMeters;
    const warpedPosition = warpPatchPosition(positionX, positionY, config, seed);
    const value = evaluatePatchFieldValue(
      warpedPosition.x,
      warpedPosition.y,
      readNearbyPatchSources(spatialIndex, geometry, warpedPosition.x, warpedPosition.y),
      config,
      seed,
    );
    const coverageByte = Math.round(value.coverage * 255);
    data[pixelIndex * 2] = coverageByte;
    data[pixelIndex * 2 + 1] = Math.round((value.colorVariation * 0.5 + 0.5) * 255);
    coverageSum += coverageByte / 255;
  }
  return coverageSum / eligiblePixelIndices.length;
}

function createPatchSpatialIndex(
  sources: readonly PatchSource[],
  config: EnabledGroundPatchConfig,
  geometry: PatchFieldGeometry,
): PatchSpatialIndex {
  const bucketSizeMeters = config.radiusMeters.maximum;
  const width = Math.max(1, Math.ceil(geometry.extentMetersX / bucketSizeMeters));
  const height = Math.max(1, Math.ceil(geometry.extentMetersY / bucketSizeMeters));
  const buckets: PatchSource[][] = Array.from(
    { length: width * height },
    () => [],
  );
  const unionPadding = config.allowMerging
    ? config.radiusMeters.minimum * 0.25
    : 0;

  for (const source of sources) {
    const extent = patchSourceExtent(source)
      + unionPadding;
    const minimumBucketX = clamp(
      Math.floor((source.centerX - extent - geometry.originMetersX) / bucketSizeMeters),
      0,
      width - 1,
    );
    const maximumBucketX = clamp(
      Math.floor((source.centerX + extent - geometry.originMetersX) / bucketSizeMeters),
      0,
      width - 1,
    );
    const minimumBucketY = clamp(
      Math.floor((source.centerY - extent - geometry.originMetersY) / bucketSizeMeters),
      0,
      height - 1,
    );
    const maximumBucketY = clamp(
      Math.floor((source.centerY + extent - geometry.originMetersY) / bucketSizeMeters),
      0,
      height - 1,
    );
    for (let bucketY = minimumBucketY; bucketY <= maximumBucketY; bucketY += 1) {
      for (let bucketX = minimumBucketX; bucketX <= maximumBucketX; bucketX += 1) {
        buckets[bucketY * width + bucketX]!.push(source);
      }
    }
  }

  return { buckets, width, height, bucketSizeMeters };
}

function readNearbyPatchSources(
  index: PatchSpatialIndex,
  geometry: PatchFieldGeometry,
  positionX: number,
  positionY: number,
): readonly PatchSource[] {
  const bucketX = clamp(
    Math.floor((positionX - geometry.originMetersX) / index.bucketSizeMeters),
    0,
    index.width - 1,
  );
  const bucketY = clamp(
    Math.floor((positionY - geometry.originMetersY) / index.bucketSizeMeters),
    0,
    index.height - 1,
  );
  return index.buckets[bucketY * index.width + bucketX]!;
}

function sampleFieldChannel(
  field: GroundPatchField,
  sampleX: number,
  sampleY: number,
  channel: 0 | 1,
): number {
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(x0 + 1, field.width - 1);
  const y1 = Math.min(y0 + 1, field.height - 1);
  const fractionX = sampleX - x0;
  const fractionY = sampleY - y0;
  const top = interpolate(
    field.data[(y0 * field.width + x0) * 2 + channel]!,
    field.data[(y0 * field.width + x1) * 2 + channel]!,
    fractionX,
  );
  const bottom = interpolate(
    field.data[(y1 * field.width + x0) * 2 + channel]!,
    field.data[(y1 * field.width + x1) * 2 + channel]!,
    fractionX,
  );
  return Math.round(interpolate(top, bottom, fractionY));
}

function createFieldResult(
  file: ParsedVegFile,
  layerId: number,
  config: EnabledGroundPatchConfig,
  geometry: PatchFieldGeometry,
  data: Uint8Array,
  patchCount: number,
  eligibleSampleCount: number,
  achievedCoverage: number,
): GroundPatchField {
  const { unitsPerMeter } = file.header.coordinateSystem;
  return {
    layerId,
    data,
    width: geometry.width,
    height: geometry.height,
    texelSizeUnits: geometry.texelSizeMeters * unitsPerMeter,
    texelSizeMeters: geometry.texelSizeMeters,
    originX: file.header.grid.originX,
    originY: file.header.grid.originY,
    baseColor: config.colors.baseColor,
    brightnessVariation: config.colors.brightnessVariation,
    patchCount,
    eligibleSampleCount,
    achievedCoverage,
  };
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
