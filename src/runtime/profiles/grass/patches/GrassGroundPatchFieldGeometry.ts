import type { ParsedVegFile, ParsedVegLayer } from '../../../parser/types.js';
import type { EnabledGrassGroundPatchConfig } from './types.js';

const FIELD_SAMPLES_PER_FALLOFF = 4;
const FIELD_SAMPLES_PER_MINIMUM_RADIUS = 8;
const MAX_FIELD_AXIS_TEXELS = 1024;

export type PatchFieldGeometry = Readonly<{
  originMetersX: number;
  originMetersY: number;
  extentMetersX: number;
  extentMetersY: number;
  texelSizeMeters: number;
  width: number;
  height: number;
}>;

export function createPatchFieldGeometry(
  file: ParsedVegFile,
  config: EnabledGrassGroundPatchConfig,
): PatchFieldGeometry {
  const { grid } = file.header;
  const { unitsPerMeter } = file.header.coordinateSystem;
  const radiusTexelSize = config.radiusMeters.minimum
    / FIELD_SAMPLES_PER_MINIMUM_RADIUS;
  const falloffTexelSize = config.edgeFalloffMeters > 0
    ? config.edgeFalloffMeters / FIELD_SAMPLES_PER_FALLOFF
    : radiusTexelSize;
  const extentMetersX = grid.width * grid.chunkSize / unitsPerMeter;
  const extentMetersY = grid.height * grid.chunkSize / unitsPerMeter;
  // Bound startup work and texture memory; sub-texel edges remain bilinearly filtered.
  const texelSizeMeters = Math.max(
    Math.min(radiusTexelSize, falloffTexelSize),
    Math.max(extentMetersX, extentMetersY) / MAX_FIELD_AXIS_TEXELS,
  );
  const width = Math.ceil(extentMetersX / texelSizeMeters);
  const height = Math.ceil(extentMetersY / texelSizeMeters);
  if (!Number.isFinite(texelSizeMeters) || texelSizeMeters <= 0
    || !Number.isSafeInteger(width) || width < 1
    || !Number.isSafeInteger(height) || height < 1) {
    throw new Error('VEGFILE dimensions cannot produce a finite vegetation patch field.');
  }
  return {
    originMetersX: grid.originX / unitsPerMeter,
    originMetersY: grid.originY / unitsPerMeter,
    extentMetersX,
    extentMetersY,
    texelSizeMeters,
    width,
    height,
  };
}

export function collectEligiblePatchPixels(
  file: ParsedVegFile,
  layer: ParsedVegLayer,
  geometry: PatchFieldGeometry,
): number[] {
  const eligiblePixelIndices: number[] = [];
  for (let pixelY = 0; pixelY < geometry.height; pixelY += 1) {
    const positionY = geometry.originMetersY
      + (pixelY + 0.5) * geometry.texelSizeMeters;
    for (let pixelX = 0; pixelX < geometry.width; pixelX += 1) {
      const positionX = geometry.originMetersX
        + (pixelX + 0.5) * geometry.texelSizeMeters;
      if (isVegetationAllowedAtMeters(file, layer, positionX, positionY)) {
        eligiblePixelIndices.push(pixelY * geometry.width + pixelX);
      }
    }
  }
  return eligiblePixelIndices;
}

export function isVegetationAllowedAtMeters(
  file: ParsedVegFile,
  layer: ParsedVegLayer,
  positionMetersX: number,
  positionMetersY: number,
): boolean {
  const { grid } = file.header;
  const { unitsPerMeter } = file.header.coordinateSystem;
  const relativeX = positionMetersX * unitsPerMeter - grid.originX;
  const relativeY = positionMetersY * unitsPerMeter - grid.originY;
  if (relativeX < 0 || relativeY < 0
    || relativeX >= grid.width * grid.chunkSize
    || relativeY >= grid.height * grid.chunkSize) {
    return false;
  }

  const chunkGridX = Math.floor(relativeX / grid.chunkSize);
  const chunkGridY = Math.floor(relativeY / grid.chunkSize);
  const storedChunkIndex = file.chunkLookup[chunkGridY * grid.width + chunkGridX]!;
  if (storedChunkIndex < 0) return false;

  const cellSize = grid.chunkSize / layer.maskResolution;
  const cellX = Math.min(
    layer.maskResolution - 1,
    Math.floor((relativeX - chunkGridX * grid.chunkSize) / cellSize),
  );
  const cellY = Math.min(
    layer.maskResolution - 1,
    Math.floor((relativeY - chunkGridY * grid.chunkSize) / cellSize),
  );
  const cellIndex = cellY * layer.maskResolution + cellX;
  const wordIndex = storedChunkIndex * layer.maskWordsPerChunk
    + Math.floor(cellIndex / 32);
  return ((layer.maskData[wordIndex]! >>> (cellIndex % 32)) & 1) === 1;
}
