import type { Axis } from '../config/types.js';
import type { VegetationDataset } from '../extractor/types.js';
import {
  calculateVegChecksum,
  VEG_BUILD_FINGERPRINT_SIZE,
  VEG_CHUNK_METADATA_SIZE,
  VEG_FORMAT_VERSION,
  VEG_HEADER_OFFSET,
  VEG_HEADER_SIZE,
  VEG_LAYER_METADATA_SIZE,
  VEG_MAGIC_BYTES,
} from './format.js';
import type { HeightValueBits, VegFileMetadata, VegWriterConfig } from './types.js';

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffff_ffff;

type LayerLayout = Readonly<{
  metadataOffset: number;
  maskDataOffset: number;
  maskDataByteLength: number;
  wordsPerChunk: number;
}>;

type FileLayout = Readonly<{
  fileSize: number;
  layerMetadataOffset: number;
  chunkLookupOffset: number;
  chunkMetadataOffset: number;
  heightDataOffset: number;
  vegetationMaskDataOffset: number;
  heightBytesPerValue: number;
  layers: readonly LayerLayout[];
}>;

/** Encodes a neutral vegetation dataset into the VEGFILE v1 binary format. */
export function writeVegFile(
  dataset: VegetationDataset,
  config: VegWriterConfig,
  metadata: VegFileMetadata,
): Uint8Array {
  validateWriterConfig(config);
  validateFileMetadata(metadata);
  validateDataset(dataset);
  const layout = createFileLayout(dataset, config.heightValueBits);
  const output = new Uint8Array(layout.fileSize);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  writeHeader(view, dataset, config, metadata, layout);
  writeLayerMetadata(view, dataset, layout);
  writeChunkLookup(view, dataset, layout);
  writeChunksAndHeights(view, dataset, config.heightValueBits, layout);
  writeMasks(view, dataset, layout);
  view.setUint32(
    VEG_HEADER_OFFSET.fileChecksum,
    calculateVegChecksum(output),
    true,
  );
  return output;
}
function createFileLayout(
  dataset: VegetationDataset,
  heightValueBits: HeightValueBits,
): FileLayout {
  const layerMetadataOffset = VEG_HEADER_SIZE;
  const chunkLookupOffset = checkedAdd(
    layerMetadataOffset,
    checkedMultiply(dataset.layers.length, VEG_LAYER_METADATA_SIZE),
  );
  const chunkMetadataOffset = checkedAdd(
    chunkLookupOffset,
    checkedMultiply(dataset.chunkLookup.length, 4),
  );
  const heightDataOffset = checkedAdd(
    chunkMetadataOffset,
    checkedMultiply(dataset.chunks.length, VEG_CHUNK_METADATA_SIZE),
  );
  const heightBytesPerValue = heightValueBits / 8;
  const heightDataByteLength = checkedMultiply(dataset.heightData.length, heightBytesPerValue);
  const vegetationMaskDataOffset = align4(checkedAdd(heightDataOffset, heightDataByteLength));

  let nextMaskOffset = vegetationMaskDataOffset;
  const layers = dataset.layers.map((layer, layerIndex): LayerLayout => {
    const wordsPerChunk = Math.ceil(layer.maskResolution ** 2 / 32);
    const maskDataByteLength = checkedMultiply(
      dataset.chunks.length,
      checkedMultiply(wordsPerChunk, 4),
    );
    const result = {
      metadataOffset: layerMetadataOffset + layerIndex * VEG_LAYER_METADATA_SIZE,
      maskDataOffset: nextMaskOffset,
      maskDataByteLength,
      wordsPerChunk,
    };
    nextMaskOffset = checkedAdd(nextMaskOffset, maskDataByteLength);
    return result;
  });

  return {
    fileSize: nextMaskOffset,
    layerMetadataOffset,
    chunkLookupOffset,
    chunkMetadataOffset,
    heightDataOffset,
    vegetationMaskDataOffset,
    heightBytesPerValue,
    layers,
  };
}

function writeHeader(
  view: DataView,
  dataset: VegetationDataset,
  config: VegWriterConfig,
  metadata: VegFileMetadata,
  layout: FileLayout,
): void {
  for (let index = 0; index < VEG_MAGIC_BYTES.length; index += 1) {
    view.setUint8(VEG_HEADER_OFFSET.magic + index, VEG_MAGIC_BYTES[index]!);
  }
  view.setUint16(VEG_HEADER_OFFSET.version, config.fileVersion, true);
  view.setUint16(VEG_HEADER_OFFSET.headerSize, VEG_HEADER_SIZE, true);
  view.setUint32(VEG_HEADER_OFFSET.flags, 0, true);
  view.setUint32(VEG_HEADER_OFFSET.fileSize, layout.fileSize, true);
  view.setUint32(VEG_HEADER_OFFSET.gridWidth, dataset.grid.width, true);
  view.setUint32(VEG_HEADER_OFFSET.gridHeight, dataset.grid.height, true);
  view.setUint32(VEG_HEADER_OFFSET.storedChunkCount, dataset.chunks.length, true);
  view.setUint32(VEG_HEADER_OFFSET.layerCount, dataset.layers.length, true);
  view.setUint32(VEG_HEADER_OFFSET.seed, dataset.seed, true);
  view.setFloat32(VEG_HEADER_OFFSET.chunkSize, dataset.grid.chunkSize, true);
  view.setFloat32(VEG_HEADER_OFFSET.gridOriginX, dataset.grid.originX, true);
  view.setFloat32(VEG_HEADER_OFFSET.gridOriginY, dataset.grid.originY, true);
  view.setFloat32(VEG_HEADER_OFFSET.unitsPerMeter, dataset.coordinateSystem.unitsPerMeter, true);

  const bounds = dataset.sourceBounds;
  const boundValues = [
    bounds.minX, bounds.minY, bounds.minZ,
    bounds.maxX, bounds.maxY, bounds.maxZ,
  ];
  for (let index = 0; index < boundValues.length; index += 1) {
    view.setFloat32(VEG_HEADER_OFFSET.sourceBounds + index * 4, boundValues[index]!, true);
  }

  view.setUint8(VEG_HEADER_OFFSET.upAxis, axisCode(dataset.coordinateSystem.upAxis));
  view.setUint8(
    VEG_HEADER_OFFSET.horizontalAxisX,
    axisCode(dataset.coordinateSystem.horizontalAxes[0]),
  );
  view.setUint8(
    VEG_HEADER_OFFSET.horizontalAxisY,
    axisCode(dataset.coordinateSystem.horizontalAxes[1]),
  );
  view.setUint8(VEG_HEADER_OFFSET.heightValueBits, config.heightValueBits);
  view.setUint16(VEG_HEADER_OFFSET.heightResolution, dataset.heightMap.resolution, true);
  view.setUint32(VEG_HEADER_OFFSET.layerMetadata, layout.layerMetadataOffset, true);
  view.setUint32(VEG_HEADER_OFFSET.chunkLookup, layout.chunkLookupOffset, true);
  view.setUint32(VEG_HEADER_OFFSET.chunkMetadata, layout.chunkMetadataOffset, true);
  view.setUint32(VEG_HEADER_OFFSET.heightData, layout.heightDataOffset, true);
  view.setUint32(
    VEG_HEADER_OFFSET.vegetationMaskData,
    layout.vegetationMaskDataOffset,
    true,
  );
  for (let index = 0; index < metadata.buildFingerprint.length; index += 1) {
    view.setUint8(
      VEG_HEADER_OFFSET.buildFingerprint + index,
      metadata.buildFingerprint[index]!,
    );
  }
}

function writeLayerMetadata(
  view: DataView,
  dataset: VegetationDataset,
  layout: FileLayout,
): void {
  for (let index = 0; index < dataset.layers.length; index += 1) {
    const layer = dataset.layers[index]!;
    const layerLayout = layout.layers[index]!;
    view.setUint32(layerLayout.metadataOffset, layer.id, true);
    view.setUint16(layerLayout.metadataOffset + 4, layer.maskResolution, true);
    view.setUint16(layerLayout.metadataOffset + 6, 0, true);
    view.setUint32(layerLayout.metadataOffset + 8, layerLayout.maskDataOffset, true);
    view.setUint32(layerLayout.metadataOffset + 12, layerLayout.maskDataByteLength, true);
  }
}

function writeChunkLookup(
  view: DataView,
  dataset: VegetationDataset,
  layout: FileLayout,
): void {
  for (let index = 0; index < dataset.chunkLookup.length; index += 1) {
    view.setInt32(layout.chunkLookupOffset + index * 4, dataset.chunkLookup[index]!, true);
  }
}

function writeChunksAndHeights(
  view: DataView,
  dataset: VegetationDataset,
  heightValueBits: HeightValueBits,
  layout: FileLayout,
): void {
  const valuesPerChunk = dataset.heightMap.resolution ** 2;
  const maximumInteger = heightValueBits === 32
    ? UINT32_MAX
    : (2 ** heightValueBits) - 1;
  let heightByteOffset = layout.heightDataOffset;

  for (let chunkIndex = 0; chunkIndex < dataset.chunks.length; chunkIndex += 1) {
    const chunk = dataset.chunks[chunkIndex]!;
    const minimumHeight = Math.fround(chunk.minimumHeight);
    const maximumHeight = Math.fround(chunk.maximumHeight);
    const metadataOffset = layout.chunkMetadataOffset + chunkIndex * VEG_CHUNK_METADATA_SIZE;
    view.setFloat32(metadataOffset, minimumHeight, true);
    view.setFloat32(metadataOffset + 4, maximumHeight, true);

    const range = maximumHeight - minimumHeight;
    const firstValue = chunkIndex * valuesPerChunk;
    for (let sampleIndex = 0; sampleIndex < valuesPerChunk; sampleIndex += 1) {
      const height = dataset.heightData[firstValue + sampleIndex]!;
      const normalized = range === 0
        ? 0
        : clamp01((height - minimumHeight) / range);
      const quantized = Math.round(normalized * maximumInteger);
      if (heightValueBits === 8) view.setUint8(heightByteOffset, quantized);
      else if (heightValueBits === 16) view.setUint16(heightByteOffset, quantized, true);
      else view.setUint32(heightByteOffset, quantized, true);
      heightByteOffset += layout.heightBytesPerValue;
    }
  }
}

function writeMasks(
  view: DataView,
  dataset: VegetationDataset,
  layout: FileLayout,
): void {
  for (let layerIndex = 0; layerIndex < dataset.layers.length; layerIndex += 1) {
    const layer = dataset.layers[layerIndex]!;
    const layerLayout = layout.layers[layerIndex]!;
    const cellsPerChunk = layer.maskResolution ** 2;
    let activeCellCount = 0;
    for (let chunkIndex = 0; chunkIndex < dataset.chunks.length; chunkIndex += 1) {
      const firstCell = chunkIndex * cellsPerChunk;
      for (let wordIndex = 0; wordIndex < layerLayout.wordsPerChunk; wordIndex += 1) {
        let word = 0;
        for (let bitIndex = 0; bitIndex < 32; bitIndex += 1) {
          const cellIndex = wordIndex * 32 + bitIndex;
          if (cellIndex >= cellsPerChunk) break;
          const value = layer.maskData[firstCell + cellIndex]!;
          if (value === 1) {
            word = (word | (1 << bitIndex)) >>> 0;
            activeCellCount += 1;
          }
        }
        const target = layerLayout.maskDataOffset
          + (chunkIndex * layerLayout.wordsPerChunk + wordIndex) * 4;
        view.setUint32(target, word, true);
      }
    }
    if (activeCellCount !== layer.activeCellCount) {
      throw new Error(
        `Layer "${layer.key}" activeCellCount does not match its mask data.`,
      );
    }
  }
}

function validateWriterConfig(config: VegWriterConfig): void {
  if (config.format !== 'veg') throw new Error('Writer format must be "veg".');
  if (config.fileVersion !== VEG_FORMAT_VERSION) {
    throw new Error(`Unsupported .veg file version ${config.fileVersion}.`);
  }
  if (config.byteOrder !== 'little-endian') {
    throw new Error('VEGFILE v1 uses little-endian byte order.');
  }
  if (![8, 16, 32].includes(config.heightValueBits)) {
    throw new Error('heightValueBits must be 8, 16 or 32.');
  }
}

function validateFileMetadata(metadata: VegFileMetadata): void {
  if (metadata.buildFingerprint.length !== VEG_BUILD_FINGERPRINT_SIZE) {
    throw new Error(
      `buildFingerprint must contain exactly ${VEG_BUILD_FINGERPRINT_SIZE} bytes.`,
    );
  }
}

function validateDataset(dataset: VegetationDataset): void {
  validateUint32('seed', dataset.seed);
  validateUint32('grid.width', dataset.grid.width, 1);
  validateUint32('grid.height', dataset.grid.height, 1);
  validateFinitePositive('grid.chunkSize', dataset.grid.chunkSize);
  validateFinite('grid.originX', dataset.grid.originX);
  validateFinite('grid.originY', dataset.grid.originY);
  validateFinitePositive('coordinateSystem.unitsPerMeter', dataset.coordinateSystem.unitsPerMeter);
  const axes = [dataset.coordinateSystem.upAxis, ...dataset.coordinateSystem.horizontalAxes];
  if (new Set(axes).size !== 3) throw new Error('Dataset coordinate axes must be unique.');

  const bounds = dataset.sourceBounds;
  const boundValues = [
    bounds.minX, bounds.minY, bounds.minZ,
    bounds.maxX, bounds.maxY, bounds.maxZ,
  ];
  for (const value of boundValues) validateFinite('sourceBounds', value);
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ) {
    throw new Error('Dataset source bounds are invalid.');
  }

  validateUint16('heightMap.resolution', dataset.heightMap.resolution, 2);
  validateUint32('storedChunkCount', dataset.chunks.length, 1);
  validateUint32('layerCount', dataset.layers.length, 1);
  const logicalChunkCount = checkedMultiply(dataset.grid.width, dataset.grid.height);
  if (dataset.chunkLookup.length !== logicalChunkCount) {
    throw new Error('chunkLookup length does not match the logical chunk grid.');
  }

  const seenStoredChunks = new Uint8Array(dataset.chunks.length);
  for (let logicalIndex = 0; logicalIndex < dataset.chunkLookup.length; logicalIndex += 1) {
    const storedIndex = dataset.chunkLookup[logicalIndex]!;
    if (storedIndex === -1) continue;
    if (!Number.isInteger(storedIndex) || storedIndex < 0 || storedIndex >= dataset.chunks.length) {
      throw new Error(`chunkLookup contains invalid stored index ${storedIndex}.`);
    }
    if (seenStoredChunks[storedIndex] === 1) {
      throw new Error(`chunkLookup references stored index ${storedIndex} more than once.`);
    }
    seenStoredChunks[storedIndex] = 1;
    const chunk = dataset.chunks[storedIndex]!;
    const expectedGridX = logicalIndex % dataset.grid.width;
    const expectedGridY = Math.floor(logicalIndex / dataset.grid.width);
    if (chunk.gridX !== expectedGridX || chunk.gridY !== expectedGridY) {
      throw new Error(`Stored chunk ${storedIndex} does not match its chunkLookup position.`);
    }
  }
  if (seenStoredChunks.some((value) => value === 0)) {
    throw new Error('Every stored chunk must be referenced by chunkLookup exactly once.');
  }

  const valuesPerChunk = dataset.heightMap.resolution ** 2;
  if (dataset.heightData.length !== dataset.chunks.length * valuesPerChunk) {
    throw new Error('heightData length does not match the stored chunks and resolution.');
  }
  for (let chunkIndex = 0; chunkIndex < dataset.chunks.length; chunkIndex += 1) {
    const chunk = dataset.chunks[chunkIndex]!;
    validateFinite(`chunks[${chunkIndex}].minimumHeight`, chunk.minimumHeight);
    validateFinite(`chunks[${chunkIndex}].maximumHeight`, chunk.maximumHeight);
    if (chunk.minimumHeight > chunk.maximumHeight) {
      throw new Error(`Stored chunk ${chunkIndex} has an invalid height interval.`);
    }
    const firstValue = chunkIndex * valuesPerChunk;
    for (let sampleIndex = 0; sampleIndex < valuesPerChunk; sampleIndex += 1) {
      const height = dataset.heightData[firstValue + sampleIndex]!;
      validateFinite(`heightData[${firstValue + sampleIndex}]`, height);
      if (height < chunk.minimumHeight || height > chunk.maximumHeight) {
        throw new Error(`Height sample ${firstValue + sampleIndex} is outside its chunk interval.`);
      }
    }
  }

  const layerIds = new Set<number>();
  for (const layer of dataset.layers) {
    validateUint32(`layer "${layer.key}" ID`, layer.id);
    if (layerIds.has(layer.id)) throw new Error('Dataset vegetation layer IDs must be unique.');
    layerIds.add(layer.id);
    validateUint16(`maskResolution for "${layer.key}"`, layer.maskResolution, 1);
    validateUint32(`activeCellCount for "${layer.key}"`, layer.activeCellCount);
    const expectedLength = checkedMultiply(
      dataset.chunks.length,
      layer.maskResolution ** 2,
    );
    if (layer.maskData.length !== expectedLength) {
      throw new Error(`Layer "${layer.key}" maskData length is invalid.`);
    }
    for (const value of layer.maskData) {
      if (value !== 0 && value !== 1) {
        throw new Error(`Layer "${layer.key}" maskData may contain only 0 or 1.`);
      }
    }
  }
}

function axisCode(axis: Axis): number {
  if (axis === 'x') return 0;
  if (axis === 'y') return 1;
  return 2;
}

function checkedMultiply(first: number, second: number): number {
  const result = first * second;
  if (!Number.isSafeInteger(result) || result > UINT32_MAX) {
    throw new Error('VEGFILE v1 size exceeds the unsigned 32-bit limit.');
  }
  return result;
}

function checkedAdd(first: number, second: number): number {
  const result = first + second;
  if (!Number.isSafeInteger(result) || result > UINT32_MAX) {
    throw new Error('VEGFILE v1 size exceeds the unsigned 32-bit limit.');
  }
  return result;
}

function align4(value: number): number {
  return checkedAdd(value, (4 - (value % 4)) % 4);
}

function validateUint16(name: string, value: number, minimum = 0): void {
  if (!Number.isInteger(value) || value < minimum || value > UINT16_MAX) {
    throw new Error(`${name} must be an unsigned 16-bit integer.`);
  }
}

function validateUint32(name: string, value: number, minimum = 0): void {
  if (!Number.isInteger(value) || value < minimum || value > UINT32_MAX) {
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
  }
}

function validateFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
}

function validateFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero.`);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
