import {
  ELEMENT_BOTTOM_COLOR_BITS,
  ELEMENT_HEIGHT_BITS,
  ELEMENT_OFFSET_ANGLE_BITS,
  ELEMENT_OFFSET_RADIUS_BITS,
  ELEMENT_ORIENTATION_BITS,
  ELEMENT_TILT_BITS,
  ELEMENT_TOP_COLOR_BITS,
  ELEMENT_WIDTH_BITS,
} from '../identity/ElementHashLayout.js';
import {
  hashVegetationElementDetails,
  readVegetationHashBits,
} from '../identity/VegetationIds.js';
import type { QuantizedHeightData } from '../parser/types.js';

const HASH_BYTE_MAXIMUM = 255;

export type VegetationInstanceAddress = Readonly<{
  visibleChunkIndex: number;
  localCellX: number;
  localCellY: number;
  anchorIndex: number;
  elementIndex: number;
}>;

export type VegetationElementVariation = Readonly<{
  height: number;
  width: number;
  orientation: number;
  tilt: number;
  offsetAngle: number;
  offsetRadius: number;
  bottomColorValue: number;
  topColorValue: number;
}>;

/** CPU reference for the dense instance-address calculation used by the shader. */
export function readVegetationInstanceAddress(
  instanceIndex: number,
  maskResolution: number,
  anchorsPerCell: number,
  elementsPerAnchor: number,
): VegetationInstanceAddress {
  for (const [name, value] of [
    ['instanceIndex', instanceIndex],
    ['maskResolution', maskResolution],
    ['anchorsPerCell', anchorsPerCell],
    ['elementsPerAnchor', elementsPerAnchor],
  ] as const) {
    if (!Number.isInteger(value) || value < (name === 'instanceIndex' ? 0 : 1)) {
      throw new Error(`${name} is outside the supported placement range.`);
    }
  }

  const elementsPerCell = anchorsPerCell * elementsPerAnchor;
  const elementsPerChunk = maskResolution * maskResolution * elementsPerCell;
  if (!Number.isSafeInteger(elementsPerChunk)) {
    throw new Error('Placement dimensions exceed the safe integer range.');
  }
  const visibleChunkIndex = Math.floor(instanceIndex / elementsPerChunk);
  const chunkElementIndex = instanceIndex % elementsPerChunk;
  const cellIndex = Math.floor(chunkElementIndex / elementsPerCell);
  const cellElementIndex = chunkElementIndex % elementsPerCell;
  return {
    visibleChunkIndex,
    localCellX: cellIndex % maskResolution,
    localCellY: Math.floor(cellIndex / maskResolution),
    anchorIndex: Math.floor(cellElementIndex / elementsPerAnchor),
    elementIndex: cellElementIndex % elementsPerAnchor,
  };
}

/** Mirrors first and then rotates counter-clockwise in quarter turns. */
export function transformVegetationAnchor(
  x: number,
  y: number,
  rotationQuarterTurns: 0 | 1 | 2 | 3,
  reflected: boolean,
): readonly [number, number] {
  let transformedX = reflected ? 1 - x : x;
  let transformedY = y;
  for (let turn = 0; turn < rotationQuarterTurns; turn += 1) {
    const previousX = transformedX;
    transformedX = 1 - transformedY;
    transformedY = previousX;
  }
  return [transformedX, transformedY];
}

/** Reads the two deterministic property bytes stored in the Element hash pair. */
export function readVegetationElementVariation(
  elementHash: number,
): VegetationElementVariation {
  const detailHash = hashVegetationElementDetails(elementHash);
  return {
    height: readByteRatio(elementHash, ELEMENT_HEIGHT_BITS),
    width: readByteRatio(elementHash, ELEMENT_WIDTH_BITS),
    orientation: readByteRatio(elementHash, ELEMENT_ORIENTATION_BITS),
    tilt: readByteRatio(elementHash, ELEMENT_TILT_BITS),
    offsetAngle: readByteRatio(detailHash, ELEMENT_OFFSET_ANGLE_BITS),
    offsetRadius: readByteRatio(detailHash, ELEMENT_OFFSET_RADIUS_BITS),
    bottomColorValue: readVegetationHashBits(
      detailHash,
      ELEMENT_BOTTOM_COLOR_BITS.offset,
      ELEMENT_BOTTOM_COLOR_BITS.length,
    ),
    topColorValue: readVegetationHashBits(
      detailHash,
      ELEMENT_TOP_COLOR_BITS.offset,
      ELEMENT_TOP_COLOR_BITS.length,
    ),
  };
}

/** Bilinearly reconstructs one model-space height from quantized chunk samples. */
export function interpolateVegetationHeight(
  heightData: QuantizedHeightData,
  storedChunkIndex: number,
  resolution: number,
  minimumHeight: number,
  maximumHeight: number,
  maximumQuantizedHeight: number,
  chunkU: number,
  chunkV: number,
): number {
  if (!Number.isInteger(storedChunkIndex) || storedChunkIndex < 0) {
    throw new Error('storedChunkIndex must be a non-negative integer.');
  }
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new Error('resolution must be an integer greater than one.');
  }
  if (!Number.isFinite(minimumHeight) || !Number.isFinite(maximumHeight)
    || maximumHeight < minimumHeight) {
    throw new Error('Height range must contain ordered finite values.');
  }
  if (!Number.isInteger(maximumQuantizedHeight) || maximumQuantizedHeight < 1) {
    throw new Error('maximumQuantizedHeight must be a positive integer.');
  }
  if (!Number.isFinite(chunkU) || !Number.isFinite(chunkV)) {
    throw new Error('Chunk coordinates must be finite.');
  }

  const sampleX = clamp01(chunkU) * (resolution - 1);
  const sampleY = clamp01(chunkV) * (resolution - 1);
  const minimumX = Math.floor(sampleX);
  const minimumY = Math.floor(sampleY);
  const maximumX = Math.min(minimumX + 1, resolution - 1);
  const maximumY = Math.min(minimumY + 1, resolution - 1);
  const offset = storedChunkIndex * resolution * resolution;
  const lowerLeft = decodeHeight(
    heightData[offset + minimumY * resolution + minimumX]!,
    minimumHeight,
    maximumHeight,
    maximumQuantizedHeight,
  );
  const lowerRight = decodeHeight(
    heightData[offset + minimumY * resolution + maximumX]!,
    minimumHeight,
    maximumHeight,
    maximumQuantizedHeight,
  );
  const upperLeft = decodeHeight(
    heightData[offset + maximumY * resolution + minimumX]!,
    minimumHeight,
    maximumHeight,
    maximumQuantizedHeight,
  );
  const upperRight = decodeHeight(
    heightData[offset + maximumY * resolution + maximumX]!,
    minimumHeight,
    maximumHeight,
    maximumQuantizedHeight,
  );
  const horizontal = sampleX - minimumX;
  const vertical = sampleY - minimumY;
  return mix(
    mix(lowerLeft, lowerRight, horizontal),
    mix(upperLeft, upperRight, horizontal),
    vertical,
  );
}

function readByteRatio(
  hash: number,
  bits: Readonly<{ offset: number; length: number }>,
): number {
  return readVegetationHashBits(hash, bits.offset, bits.length) / HASH_BYTE_MAXIMUM;
}

function decodeHeight(
  quantizedHeight: number,
  minimumHeight: number,
  maximumHeight: number,
  maximumQuantizedHeight: number,
): number {
  return mix(
    minimumHeight,
    maximumHeight,
    quantizedHeight / maximumQuantizedHeight,
  );
}

function mix(minimum: number, maximum: number, ratio: number): number {
  return minimum + (maximum - minimum) * ratio;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
