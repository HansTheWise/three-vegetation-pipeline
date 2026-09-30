import {
  VEG_FILE_CHUNK_HEIGHT_RANGE_SIZE,
  VEG_FILE_HEADER_SIZE,
  VEG_FILE_LAYER_METADATA_SIZE,
} from './VegFileV2Schema.js';
import type { HeightValueBits } from './VegetationFileTypes.js';

export type VegFileV2LayerByteLayout = Readonly<{
  metadataOffset: number;
  maskDataOffset: number;
  maskDataByteLength: number;
  cellsPerChunk: number;
  wordsPerChunk: number;
}>;

export type VegFileV2ByteLayout = Readonly<{
  fileByteLength: number;
  layerMetadataOffset: number;
  chunkLookupOffset: number;
  chunkHeightRangesOffset: number;
  heightDataOffset: number;
  vegetationMaskDataOffset: number;
  heightBytesPerValue: number;
  heightValueCount: number;
  heightDataByteLength: number;
  layers: readonly VegFileV2LayerByteLayout[];
}>;

export type VegFileV2ByteLayoutInput = Readonly<{
  gridWidth: number;
  gridHeight: number;
  storedChunkCount: number;
  heightMapResolutionPerChunkAxis: number;
  heightValueBits: HeightValueBits;
  layerMaskResolutionsPerChunkAxis: readonly number[];
}>;

/** Derives every v2 section position; none of these offsets are stored in the file. */
export function calculateVegFileV2ByteLayout(
  input: VegFileV2ByteLayoutInput,
): VegFileV2ByteLayout {
  const logicalChunkCount = checkedMultiply(
    input.gridWidth,
    input.gridHeight,
    'logical chunk count',
  );
  const layerMetadataOffset = VEG_FILE_HEADER_SIZE;
  const chunkLookupOffset = checkedAdd(
    layerMetadataOffset,
    checkedMultiply(
      input.layerMaskResolutionsPerChunkAxis.length,
      VEG_FILE_LAYER_METADATA_SIZE,
      'layer metadata size',
    ),
    'chunk lookup offset',
  );
  const chunkHeightRangesOffset = checkedAdd(
    chunkLookupOffset,
    checkedMultiply(logicalChunkCount, 4, 'chunk lookup size'),
    'chunk height ranges offset',
  );
  const heightDataOffset = checkedAdd(
    chunkHeightRangesOffset,
    checkedMultiply(
      input.storedChunkCount,
      VEG_FILE_CHUNK_HEIGHT_RANGE_SIZE,
      'chunk height ranges size',
    ),
    'height data offset',
  );
  const heightValueCount = checkedMultiply(
    input.storedChunkCount,
    checkedMultiply(
      input.heightMapResolutionPerChunkAxis,
      input.heightMapResolutionPerChunkAxis,
      'height values per chunk',
    ),
    'height value count',
  );
  const heightBytesPerValue = input.heightValueBits / 8;
  const heightDataByteLength = checkedMultiply(
    heightValueCount,
    heightBytesPerValue,
    'height data size',
  );
  const vegetationMaskDataOffset = align4(checkedAdd(
    heightDataOffset,
    heightDataByteLength,
    'vegetation mask data offset',
  ));

  let nextMaskDataOffset = vegetationMaskDataOffset;
  const layers = input.layerMaskResolutionsPerChunkAxis.map(
    (maskResolutionPerChunkAxis, layerIndex) => {
      const cellsPerChunk = checkedMultiply(
        maskResolutionPerChunkAxis,
        maskResolutionPerChunkAxis,
        `layer ${layerIndex} cells per chunk`,
      );
      const wordsPerChunk = Math.ceil(cellsPerChunk / 32);
      const maskDataByteLength = checkedMultiply(
        checkedMultiply(
          input.storedChunkCount,
          wordsPerChunk,
          `layer ${layerIndex} mask word count`,
        ),
        4,
        `layer ${layerIndex} mask size`,
      );
      const layerLayout = {
        metadataOffset: layerMetadataOffset + layerIndex * VEG_FILE_LAYER_METADATA_SIZE,
        maskDataOffset: nextMaskDataOffset,
        maskDataByteLength,
        cellsPerChunk,
        wordsPerChunk,
      };
      nextMaskDataOffset = checkedAdd(
        nextMaskDataOffset,
        maskDataByteLength,
        `layer ${layerIndex} mask end`,
      );
      return layerLayout;
    },
  );

  return {
    fileByteLength: nextMaskDataOffset,
    layerMetadataOffset,
    chunkLookupOffset,
    chunkHeightRangesOffset,
    heightDataOffset,
    vegetationMaskDataOffset,
    heightBytesPerValue,
    heightValueCount,
    heightDataByteLength,
    layers,
  };
}

export function checkedVegFileMultiply(
  first: number,
  second: number,
  name: string,
): number {
  return checkedMultiply(first, second, name);
}

function checkedMultiply(first: number, second: number, name: string): number {
  const result = first * second;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`VEGFILE v2 ${name} exceeds the JavaScript safe integer range.`);
  }
  return result;
}

function checkedAdd(first: number, second: number, name: string): number {
  const result = first + second;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`VEGFILE v2 ${name} exceeds the JavaScript safe integer range.`);
  }
  return result;
}

function align4(value: number): number {
  return checkedAdd(value, (4 - (value % 4)) % 4, 'aligned offset');
}
