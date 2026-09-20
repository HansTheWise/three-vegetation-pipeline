import type { Axis } from '../offline-compilation-orchestration/VegetationCompilerConfig.js';
import type { VegetationDataset } from '../vegetation-dataset-extraction/VegetationExtractionTypes.js';
import {
  calculateVegFileV2Layout,
  type VegFileV2Layout,
} from '../../vegfile-v2-format/VegFileV2Layout.js';
import {
  calculateVegFileChecksum,
  VEG_FILE_BUILD_FINGERPRINT_SIZE,
  VEG_FILE_FORMAT_VERSION,
  VEG_FILE_HEADER_OFFSETS,
  VEG_FILE_MAGIC_BYTES,
} from '../../vegfile-v2-format/VegFileV2Schema.js';
import type { HeightValueBits } from '../../vegfile-v2-format/VegetationFileTypes.js';
import { validateVegetationDataset } from '../vegetation-dataset-validation/VegetationDatasetValidation.js';
import type { VegFileMetadata, VegWriterConfig } from './VegWriterTypes.js';

const UINT32_MAX = 0xffff_ffff;

/** Encodes a complete neutral dataset into the fixed VEGFILE v2 schema. */
export function writeVegFile(
  dataset: VegetationDataset,
  config: VegWriterConfig,
  metadata: VegFileMetadata,
): Uint8Array {
  validateWriterConfig(config);
  validateFileMetadata(metadata);
  validateVegetationDataset(dataset);

  const layout = calculateVegFileV2Layout({
    gridWidth: dataset.grid.width,
    gridHeight: dataset.grid.height,
    storedChunkCount: dataset.storedChunkHeightRanges.length,
    heightResolution: dataset.heightMap.resolution,
    heightValueBits: config.heightValueBits,
    layerMaskResolutions: dataset.layers.map((layer) => layer.maskResolution),
  });
  const output = new Uint8Array(layout.fileByteLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  writeHeader(view, dataset, config, metadata);
  writeLayerMetadata(view, dataset, layout);
  writeChunkLookup(view, dataset, layout);
  writeChunkHeightRangesAndHeightData(
    view,
    dataset,
    config.heightValueBits,
    layout,
  );
  writeVegetationMasks(view, dataset, layout);
  view.setUint32(
    VEG_FILE_HEADER_OFFSETS.fileChecksum,
    calculateVegFileChecksum(output),
    true,
  );
  return output;
}

function writeHeader(
  view: DataView,
  dataset: VegetationDataset,
  config: VegWriterConfig,
  metadata: VegFileMetadata,
): void {
  for (let index = 0; index < VEG_FILE_MAGIC_BYTES.length; index += 1) {
    view.setUint8(VEG_FILE_HEADER_OFFSETS.magic + index, VEG_FILE_MAGIC_BYTES[index]!);
  }
  view.setUint16(VEG_FILE_HEADER_OFFSETS.version, VEG_FILE_FORMAT_VERSION, true);
  view.setUint16(
    VEG_FILE_HEADER_OFFSETS.heightResolution,
    dataset.heightMap.resolution,
    true,
  );
  view.setUint32(VEG_FILE_HEADER_OFFSETS.gridWidth, dataset.grid.width, true);
  view.setUint32(VEG_FILE_HEADER_OFFSETS.gridHeight, dataset.grid.height, true);
  view.setUint32(
    VEG_FILE_HEADER_OFFSETS.storedChunkCount,
    dataset.storedChunkHeightRanges.length,
    true,
  );
  view.setUint32(VEG_FILE_HEADER_OFFSETS.layerCount, dataset.layers.length, true);
  view.setUint32(VEG_FILE_HEADER_OFFSETS.seed, dataset.seed, true);
  view.setFloat32(VEG_FILE_HEADER_OFFSETS.chunkSize, dataset.grid.chunkSize, true);
  view.setFloat32(VEG_FILE_HEADER_OFFSETS.gridOriginX, dataset.grid.originX, true);
  view.setFloat32(VEG_FILE_HEADER_OFFSETS.gridOriginY, dataset.grid.originY, true);
  view.setFloat32(
    VEG_FILE_HEADER_OFFSETS.unitsPerMeter,
    dataset.coordinateSystem.unitsPerMeter,
    true,
  );
  const sourceBoundValues = [
    dataset.sourceBounds.minX,
    dataset.sourceBounds.minY,
    dataset.sourceBounds.minZ,
    dataset.sourceBounds.maxX,
    dataset.sourceBounds.maxY,
    dataset.sourceBounds.maxZ,
  ];
  for (let boundIndex = 0; boundIndex < sourceBoundValues.length; boundIndex += 1) {
    view.setFloat32(
      VEG_FILE_HEADER_OFFSETS.sourceBounds + boundIndex * 4,
      sourceBoundValues[boundIndex]!,
      true,
    );
  }
  view.setUint8(
    VEG_FILE_HEADER_OFFSETS.upAxis,
    encodeAxis(dataset.coordinateSystem.upAxis),
  );
  view.setUint8(
    VEG_FILE_HEADER_OFFSETS.horizontalAxisX,
    encodeAxis(dataset.coordinateSystem.horizontalAxes[0]),
  );
  view.setUint8(
    VEG_FILE_HEADER_OFFSETS.horizontalAxisY,
    encodeAxis(dataset.coordinateSystem.horizontalAxes[1]),
  );
  view.setUint8(VEG_FILE_HEADER_OFFSETS.heightValueBits, config.heightValueBits);
  for (let index = 0; index < metadata.buildFingerprint.length; index += 1) {
    view.setUint8(
      VEG_FILE_HEADER_OFFSETS.buildFingerprint + index,
      metadata.buildFingerprint[index]!,
    );
  }
}

function writeLayerMetadata(
  view: DataView,
  dataset: VegetationDataset,
  layout: VegFileV2Layout,
): void {
  for (let layerIndex = 0; layerIndex < dataset.layers.length; layerIndex += 1) {
    const layer = dataset.layers[layerIndex]!;
    const metadataOffset = layout.layers[layerIndex]!.metadataOffset;
    view.setUint32(metadataOffset, layer.id, true);
    view.setUint16(metadataOffset + 4, layer.maskResolution, true);
    // Bytes 6-7 only align the next Uint32-based section.
    view.setUint16(metadataOffset + 6, 0, true);
  }
}

function writeChunkLookup(
  view: DataView,
  dataset: VegetationDataset,
  layout: VegFileV2Layout,
): void {
  for (let logicalChunkIndex = 0;
    logicalChunkIndex < dataset.chunkLookup.length;
    logicalChunkIndex += 1) {
    view.setInt32(
      layout.chunkLookupOffset + logicalChunkIndex * 4,
      dataset.chunkLookup[logicalChunkIndex]!,
      true,
    );
  }
}

function writeChunkHeightRangesAndHeightData(
  view: DataView,
  dataset: VegetationDataset,
  heightValueBits: HeightValueBits,
  layout: VegFileV2Layout,
): void {
  const valuesPerChunk = dataset.heightMap.resolution ** 2;
  const maximumQuantizedHeight = heightValueBits === 32
    ? UINT32_MAX
    : (2 ** heightValueBits) - 1;
  let heightDataByteOffset = layout.heightDataOffset;

  for (let storedChunkIndex = 0;
    storedChunkIndex < dataset.storedChunkHeightRanges.length;
    storedChunkIndex += 1) {
    const heightRange = dataset.storedChunkHeightRanges[storedChunkIndex]!;
    const minimumHeight = Math.fround(heightRange.minimumHeight);
    const maximumHeight = Math.fround(heightRange.maximumHeight);
    const heightRangeByteOffset = layout.chunkHeightRangesOffset
      + storedChunkIndex * 8;
    view.setFloat32(heightRangeByteOffset, minimumHeight, true);
    view.setFloat32(heightRangeByteOffset + 4, maximumHeight, true);

    const heightRangeSize = maximumHeight - minimumHeight;
    const firstHeightValue = storedChunkIndex * valuesPerChunk;
    for (let sampleIndex = 0; sampleIndex < valuesPerChunk; sampleIndex += 1) {
      const height = dataset.heightData[firstHeightValue + sampleIndex]!;
      const normalizedHeight = heightRangeSize === 0
        ? 0
        : clamp01((height - minimumHeight) / heightRangeSize);
      const quantizedHeight = Math.round(normalizedHeight * maximumQuantizedHeight);
      if (heightValueBits === 8) {
        view.setUint8(heightDataByteOffset, quantizedHeight);
      } else if (heightValueBits === 16) {
        view.setUint16(heightDataByteOffset, quantizedHeight, true);
      } else {
        view.setUint32(heightDataByteOffset, quantizedHeight, true);
      }
      heightDataByteOffset += layout.heightBytesPerValue;
    }
  }
}

function writeVegetationMasks(
  view: DataView,
  dataset: VegetationDataset,
  layout: VegFileV2Layout,
): void {
  for (let layerIndex = 0; layerIndex < dataset.layers.length; layerIndex += 1) {
    const layer = dataset.layers[layerIndex]!;
    const layerLayout = layout.layers[layerIndex]!;
    for (let storedChunkIndex = 0;
      storedChunkIndex < dataset.storedChunkHeightRanges.length;
      storedChunkIndex += 1) {
      const firstCell = storedChunkIndex * layerLayout.cellsPerChunk;
      for (let wordIndex = 0; wordIndex < layerLayout.wordsPerChunk; wordIndex += 1) {
        let packedMaskWord = 0;
        for (let bitIndex = 0; bitIndex < 32; bitIndex += 1) {
          const cellIndex = wordIndex * 32 + bitIndex;
          if (cellIndex >= layerLayout.cellsPerChunk) break;
          if (layer.maskData[firstCell + cellIndex] === 1) {
            packedMaskWord = (packedMaskWord | (1 << bitIndex)) >>> 0;
          }
        }
        const targetByteOffset = layerLayout.maskDataOffset
          + (storedChunkIndex * layerLayout.wordsPerChunk + wordIndex) * 4;
        view.setUint32(targetByteOffset, packedMaskWord, true);
      }
    }
  }
}

function validateWriterConfig(config: VegWriterConfig): void {
  if (![8, 16, 32].includes(config.heightValueBits)) {
    throw new Error('heightValueBits must be 8, 16 or 32.');
  }
}

function validateFileMetadata(metadata: VegFileMetadata): void {
  if (metadata.buildFingerprint.length !== VEG_FILE_BUILD_FINGERPRINT_SIZE) {
    throw new Error(
      `buildFingerprint must contain exactly ${VEG_FILE_BUILD_FINGERPRINT_SIZE} bytes.`,
    );
  }
}

function encodeAxis(axis: Axis): number {
  if (axis === 'x') return 0;
  if (axis === 'y') return 1;
  return 2;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
