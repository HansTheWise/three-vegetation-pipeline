import type { Axis } from '../../offline/config/types.js';
import {
  calculateVegChecksum,
  VEG_BUILD_FINGERPRINT_SIZE,
  VEG_CHUNK_METADATA_SIZE,
  VEG_FORMAT_VERSION,
  VEG_HEADER_OFFSET,
  VEG_HEADER_SIZE,
  VEG_LAYER_METADATA_SIZE,
  VEG_MAGIC_BYTES,
} from '../../offline/writer/format.js';
import type { HeightValueBits } from '../../offline/writer/types.js';
import type {
  ParsedVegFile,
  ParsedVegHeader,
  ParsedVegLayer,
  QuantizedHeightData,
} from './types.js';

const UINT32_MAX = 0xffff_ffff;

type OpenVegFile = Readonly<{
  bytes: Uint8Array;
  data: DataView;
}>;

type SectionOffsets = Readonly<{
  layerMetadata: number;
  chunkLookup: number;
  chunkMetadata: number;
  heightData: number;
  vegetationMaskData: number;
}>;

type FileHeader = Readonly<{
  parsedHeader: ParsedVegHeader;
  layerCount: number;
  logicalChunkCount: number;
  sectionOffsets: SectionOffsets;
}>;

type ExpectedFileLayout = Readonly<{
  sectionOffsets: SectionOffsets;
  heightValueCount: number;
  heightDataByteLength: number;
}>;

type LayerMetadata = Readonly<{
  id: number;
  maskResolution: number;
  maskOffset: number;
  maskByteLength: number;
}>;

type LayerMaskLayout = Readonly<{
  cellsPerChunk: number;
  wordsPerChunk: number;
  byteLength: number;
}>;

/** Reads VEGFILE v1 into validated views without expanding packed data. */
export function parseVegFile(source: ArrayBuffer | Uint8Array): ParsedVegFile {
  const file = openVegFile(source);
  const header = readFileHeader(file);
  const layout = calculateExpectedLayout(header);

  validateSectionOffsets(file, header, layout);

  const layers = readVegetationLayers(file, header, layout);
  const chunkLookup = createChunkLookupView(file, header, layout);
  const chunkHeightRanges = createChunkHeightRangeView(file, header, layout);
  const heightData = createHeightDataView(file, header, layout);

  validateChunkLookup(chunkLookup, header.parsedHeader.storedChunkCount);
  validateChunkHeightRanges(chunkHeightRanges);
  validateFileChecksum(file.bytes, header.parsedHeader.fileChecksum);

  return {
    bytes: file.bytes,
    header: header.parsedHeader,
    chunkLookup,
    chunkHeightRanges,
    heightData,
    layers,
  };
}

// Typed 32-bit views require a four-byte-aligned base offset.
function openVegFile(source: ArrayBuffer | Uint8Array): OpenVegFile {
  const sourceBytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const bytes = sourceBytes.byteOffset % 4 === 0 ? sourceBytes : sourceBytes.slice();

  if (bytes.byteLength < VEG_HEADER_SIZE) {
    throw new Error(`VEGFILE is truncated: expected at least ${VEG_HEADER_SIZE} header bytes.`);
  }

  return {
    bytes,
    data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  };
}

function readFileHeader(file: OpenVegFile): FileHeader {
  validateFileIdentity(file);

  const { data } = file;
  const fileSize = data.getUint32(VEG_HEADER_OFFSET.fileSize, true);
  if (fileSize !== file.bytes.byteLength) {
    throw new Error(
      `VEGFILE fileSize ${fileSize} does not match the provided ${file.bytes.byteLength} bytes.`,
    );
  }

  const grid = readGrid(data);
  const heightMap = readHeightMap(data);
  const logicalChunkCount = checkedMultiply(grid.width, grid.height, 'logical chunk count');
  const storedChunkCount = readPositiveUint32(
    data,
    VEG_HEADER_OFFSET.storedChunkCount,
    'storedChunkCount',
  );
  const layerCount = readPositiveUint32(data, VEG_HEADER_OFFSET.layerCount, 'layerCount');

  return {
    parsedHeader: {
      version: 1,
      fileSize,
      seed: data.getUint32(VEG_HEADER_OFFSET.seed, true),
      buildFingerprint: file.bytes.subarray(
        VEG_HEADER_OFFSET.buildFingerprint,
        VEG_HEADER_OFFSET.buildFingerprint + VEG_BUILD_FINGERPRINT_SIZE,
      ),
      fileChecksum: data.getUint32(VEG_HEADER_OFFSET.fileChecksum, true),
      sourceBounds: readSourceBounds(data),
      coordinateSystem: readCoordinateSystem(data),
      grid,
      storedChunkCount,
      heightMap,
    },
    layerCount,
    logicalChunkCount,
    sectionOffsets: readSectionOffsets(data),
  };
}

function readGrid(data: DataView): ParsedVegHeader['grid'] {
  return {
    width: readPositiveUint32(data, VEG_HEADER_OFFSET.gridWidth, 'gridWidth'),
    height: readPositiveUint32(data, VEG_HEADER_OFFSET.gridHeight, 'gridHeight'),
    chunkSize: readFinitePositiveFloat32(data, VEG_HEADER_OFFSET.chunkSize, 'chunkSize'),
    originX: readFiniteFloat32(data, VEG_HEADER_OFFSET.gridOriginX, 'gridOriginX'),
    originY: readFiniteFloat32(data, VEG_HEADER_OFFSET.gridOriginY, 'gridOriginY'),
  };
}

function readHeightMap(data: DataView): ParsedVegHeader['heightMap'] {
  const resolution = data.getUint16(VEG_HEADER_OFFSET.heightResolution, true);
  if (resolution < 2) throw new Error('VEGFILE heightResolution must be at least 2.');

  return {
    resolution,
    valueBits: readHeightValueBits(data),
    valuesPerChunk: checkedMultiply(resolution, resolution, 'height values per chunk'),
  };
}

function validateFileIdentity(file: OpenVegFile): void {
  const { data } = file;
  for (let index = 0; index < VEG_MAGIC_BYTES.length; index += 1) {
    if (data.getUint8(index) !== VEG_MAGIC_BYTES[index]) {
      throw new Error('Invalid VEGFILE signature; expected "VEGFILE\\0".');
    }
  }

  const version = data.getUint16(VEG_HEADER_OFFSET.version, true);
  if (version !== VEG_FORMAT_VERSION) {
    throw new Error(`Unsupported .veg file version ${version}.`);
  }
  if (data.getUint16(VEG_HEADER_OFFSET.headerSize, true) !== VEG_HEADER_SIZE) {
    throw new Error(`VEGFILE v1 headerSize must be ${VEG_HEADER_SIZE}.`);
  }
  if (data.getUint32(VEG_HEADER_OFFSET.flags, true) !== 0) {
    throw new Error('VEGFILE v1 header flags must be zero.');
  }

  validateZeroBytes(data, 86, 88, 'reserved header bytes');
}

function validateFileChecksum(bytes: Uint8Array, storedChecksum: number): void {
  const calculatedChecksum = calculateVegChecksum(bytes);
  if (storedChecksum !== calculatedChecksum) {
    throw new Error(
      `VEGFILE checksum ${storedChecksum} does not match calculated ${calculatedChecksum}.`,
    );
  }
}

function readSourceBounds(data: DataView): ParsedVegHeader['sourceBounds'] {
  const bounds = {
    minX: data.getFloat32(VEG_HEADER_OFFSET.sourceBounds, true),
    minY: data.getFloat32(VEG_HEADER_OFFSET.sourceBounds + 4, true),
    minZ: data.getFloat32(VEG_HEADER_OFFSET.sourceBounds + 8, true),
    maxX: data.getFloat32(VEG_HEADER_OFFSET.sourceBounds + 12, true),
    maxY: data.getFloat32(VEG_HEADER_OFFSET.sourceBounds + 16, true),
    maxZ: data.getFloat32(VEG_HEADER_OFFSET.sourceBounds + 20, true),
  };

  for (const value of Object.values(bounds)) assertFinite(value, 'sourceBounds');
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ) {
    throw new Error('VEGFILE sourceBounds are invalid.');
  }
  return bounds;
}

function readCoordinateSystem(data: DataView): ParsedVegHeader['coordinateSystem'] {
  const upAxis = readAxis(data, VEG_HEADER_OFFSET.upAxis, 'upAxis');
  const horizontalAxisX = readAxis(
    data,
    VEG_HEADER_OFFSET.horizontalAxisX,
    'horizontalAxisX',
  );
  const horizontalAxisY = readAxis(
    data,
    VEG_HEADER_OFFSET.horizontalAxisY,
    'horizontalAxisY',
  );
  if (new Set([upAxis, horizontalAxisX, horizontalAxisY]).size !== 3) {
    throw new Error('VEGFILE coordinate axes must be unique.');
  }

  return {
    upAxis,
    horizontalAxes: [horizontalAxisX, horizontalAxisY],
    unitsPerMeter: readFinitePositiveFloat32(
      data,
      VEG_HEADER_OFFSET.unitsPerMeter,
      'unitsPerMeter',
    ),
  };
}

function readSectionOffsets(data: DataView): SectionOffsets {
  return {
    layerMetadata: data.getUint32(VEG_HEADER_OFFSET.layerMetadata, true),
    chunkLookup: data.getUint32(VEG_HEADER_OFFSET.chunkLookup, true),
    chunkMetadata: data.getUint32(VEG_HEADER_OFFSET.chunkMetadata, true),
    heightData: data.getUint32(VEG_HEADER_OFFSET.heightData, true),
    vegetationMaskData: data.getUint32(VEG_HEADER_OFFSET.vegetationMaskData, true),
  };
}

function calculateExpectedLayout(header: FileHeader): ExpectedFileLayout {
  const { parsedHeader } = header;
  const layerMetadata = VEG_HEADER_SIZE;
  const chunkLookup = checkedAdd(
    layerMetadata,
    checkedMultiply(header.layerCount, VEG_LAYER_METADATA_SIZE, 'layer metadata size'),
    'chunk lookup offset',
  );
  const chunkMetadata = checkedAdd(
    chunkLookup,
    checkedMultiply(header.logicalChunkCount, 4, 'chunk lookup size'),
    'chunk metadata offset',
  );
  const heightData = checkedAdd(
    chunkMetadata,
    checkedMultiply(
      parsedHeader.storedChunkCount,
      VEG_CHUNK_METADATA_SIZE,
      'chunk metadata size',
    ),
    'height data offset',
  );
  const heightValueCount = checkedMultiply(
    parsedHeader.storedChunkCount,
    parsedHeader.heightMap.valuesPerChunk,
    'height data value count',
  );
  const heightDataByteLength = checkedMultiply(
    heightValueCount,
    parsedHeader.heightMap.valueBits / 8,
    'height data size',
  );
  const vegetationMaskData = align4(checkedAdd(
    heightData,
    heightDataByteLength,
    'vegetation mask data offset',
  ));

  return {
    sectionOffsets: {
      layerMetadata,
      chunkLookup,
      chunkMetadata,
      heightData,
      vegetationMaskData,
    },
    heightValueCount,
    heightDataByteLength,
  };
}

function validateSectionOffsets(
  file: OpenVegFile,
  header: FileHeader,
  expectedLayout: ExpectedFileLayout,
): void {
  for (const name of Object.keys(expectedLayout.sectionOffsets) as (keyof SectionOffsets)[]) {
    const actualOffset = header.sectionOffsets[name];
    const expectedOffset = expectedLayout.sectionOffsets[name];
    if (actualOffset !== expectedOffset) {
      throw new Error(`VEGFILE ${name} offset ${actualOffset} must be ${expectedOffset}.`);
    }
  }

  const heightDataEnd = expectedLayout.sectionOffsets.heightData
    + expectedLayout.heightDataByteLength;
  validateZeroBytes(
    file.data,
    heightDataEnd,
    expectedLayout.sectionOffsets.vegetationMaskData,
    'height alignment padding',
  );
}

function readVegetationLayers(
  file: OpenVegFile,
  header: FileHeader,
  layout: ExpectedFileLayout,
): readonly ParsedVegLayer[] {
  const layers: ParsedVegLayer[] = [];
  const layerIds = new Set<number>();
  let expectedMaskOffset = layout.sectionOffsets.vegetationMaskData;

  for (let layerIndex = 0; layerIndex < header.layerCount; layerIndex += 1) {
    const metadataOffset = layout.sectionOffsets.layerMetadata
      + layerIndex * VEG_LAYER_METADATA_SIZE;
    const metadata = readLayerMetadata(file.data, metadataOffset);
    if (layerIds.has(metadata.id)) {
      throw new Error(`VEGFILE layer ID ${metadata.id} is duplicated.`);
    }
    layerIds.add(metadata.id);

    const maskLayout = calculateLayerMaskLayout(
      metadata,
      header.parsedHeader.storedChunkCount,
    );
    validateLayerMaskLocation(
      metadata,
      maskLayout,
      expectedMaskOffset,
      header.parsedHeader.fileSize,
    );

    const maskData = new Uint32Array(
      file.bytes.buffer,
      file.bytes.byteOffset + metadata.maskOffset,
      metadata.maskByteLength / 4,
    );
    validateMaskPaddingBits(
      maskData,
      header.parsedHeader.storedChunkCount,
      maskLayout.wordsPerChunk,
      maskLayout.cellsPerChunk,
      metadata.id,
    );

    layers.push({
      id: metadata.id,
      maskResolution: metadata.maskResolution,
      maskWordsPerChunk: maskLayout.wordsPerChunk,
      maskData,
    });
    expectedMaskOffset = checkedAdd(
      metadata.maskOffset,
      metadata.maskByteLength,
      `layer ${metadata.id} mask end`,
    );
  }

  if (expectedMaskOffset !== header.parsedHeader.fileSize) {
    throw new Error('VEGFILE layer masks do not end at the declared fileSize.');
  }
  return layers;
}

function readLayerMetadata(data: DataView, offset: number): LayerMetadata {
  const id = data.getUint32(offset, true);
  const maskResolution = data.getUint16(offset + 4, true);
  if (maskResolution < 1) {
    throw new Error(`VEGFILE layer ${id} maskResolution must be positive.`);
  }
  if (data.getUint16(offset + 6, true) !== 0) {
    throw new Error(`VEGFILE layer ${id} reserved flags must be zero.`);
  }

  return {
    id,
    maskResolution,
    maskOffset: data.getUint32(offset + 8, true),
    maskByteLength: data.getUint32(offset + 12, true),
  };
}

function calculateLayerMaskLayout(
  metadata: LayerMetadata,
  storedChunkCount: number,
): LayerMaskLayout {
  const cellsPerChunk = checkedMultiply(
    metadata.maskResolution,
    metadata.maskResolution,
    `layer ${metadata.id} cells per chunk`,
  );
  const wordsPerChunk = Math.ceil(cellsPerChunk / 32);
  const wordCount = checkedMultiply(
    storedChunkCount,
    wordsPerChunk,
    `layer ${metadata.id} mask word count`,
  );

  return {
    cellsPerChunk,
    wordsPerChunk,
    byteLength: checkedMultiply(wordCount, 4, `layer ${metadata.id} mask size`),
  };
}

function validateLayerMaskLocation(
  metadata: LayerMetadata,
  expectedLayout: LayerMaskLayout,
  expectedOffset: number,
  fileSize: number,
): void {
  if (metadata.maskOffset !== expectedOffset) {
    throw new Error(
      `VEGFILE layer ${metadata.id} maskDataOffset ${metadata.maskOffset} must be ${expectedOffset}.`,
    );
  }
  if (metadata.maskByteLength !== expectedLayout.byteLength) {
    throw new Error(
      `VEGFILE layer ${metadata.id} maskDataByteLength ${metadata.maskByteLength} must be ${expectedLayout.byteLength}.`,
    );
  }
  validateSectionEnd(
    metadata.maskOffset,
    metadata.maskByteLength,
    fileSize,
    `layer ${metadata.id}`,
  );
}

function createChunkLookupView(
  file: OpenVegFile,
  header: FileHeader,
  layout: ExpectedFileLayout,
): Int32Array {
  return new Int32Array(
    file.bytes.buffer,
    file.bytes.byteOffset + layout.sectionOffsets.chunkLookup,
    header.logicalChunkCount,
  );
}

function createChunkHeightRangeView(
  file: OpenVegFile,
  header: FileHeader,
  layout: ExpectedFileLayout,
): Float32Array {
  return new Float32Array(
    file.bytes.buffer,
    file.bytes.byteOffset + layout.sectionOffsets.chunkMetadata,
    header.parsedHeader.storedChunkCount * 2,
  );
}

function createHeightDataView(
  file: OpenVegFile,
  header: FileHeader,
  layout: ExpectedFileLayout,
): QuantizedHeightData {
  const byteOffset = file.bytes.byteOffset + layout.sectionOffsets.heightData;
  const valueBits = header.parsedHeader.heightMap.valueBits;

  if (valueBits === 8) {
    return new Uint8Array(file.bytes.buffer, byteOffset, layout.heightValueCount);
  }
  if (valueBits === 16) {
    return new Uint16Array(file.bytes.buffer, byteOffset, layout.heightValueCount);
  }
  return new Uint32Array(file.bytes.buffer, byteOffset, layout.heightValueCount);
}

function validateChunkLookup(chunkLookup: Int32Array, storedChunkCount: number): void {
  const referencedChunks = new Uint8Array(storedChunkCount);

  for (const storedChunkIndex of chunkLookup) {
    if (storedChunkIndex === -1) continue;
    if (storedChunkIndex < 0 || storedChunkIndex >= storedChunkCount) {
      throw new Error(
        `VEGFILE chunkLookup contains invalid stored index ${storedChunkIndex}.`,
      );
    }
    if (referencedChunks[storedChunkIndex] === 1) {
      throw new Error(
        `VEGFILE chunkLookup references stored index ${storedChunkIndex} more than once.`,
      );
    }
    referencedChunks[storedChunkIndex] = 1;
  }

  if (referencedChunks.some((value) => value === 0)) {
    throw new Error('VEGFILE chunkLookup must reference every stored chunk exactly once.');
  }
}

function validateChunkHeightRanges(heightRanges: Float32Array): void {
  for (let storedChunkIndex = 0; storedChunkIndex < heightRanges.length / 2; storedChunkIndex += 1) {
    const minimumHeight = heightRanges[storedChunkIndex * 2]!;
    const maximumHeight = heightRanges[storedChunkIndex * 2 + 1]!;

    if (
      !Number.isFinite(minimumHeight)
      || !Number.isFinite(maximumHeight)
      || minimumHeight > maximumHeight
    ) {
      throw new Error(
        `VEGFILE stored chunk ${storedChunkIndex} has an invalid height interval.`,
      );
    }
  }
}

// The writer leaves unused bits in the final mask word at zero.
function validateMaskPaddingBits(
  maskData: Uint32Array,
  storedChunkCount: number,
  wordsPerChunk: number,
  cellsPerChunk: number,
  layerId: number,
): void {
  const usedBitsInLastWord = cellsPerChunk % 32;
  if (usedBitsInLastWord === 0) return;

  const validBits = (2 ** usedBitsInLastWord) - 1;
  const paddingBits = (~validBits) >>> 0;
  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCount; storedChunkIndex += 1) {
    const lastWordIndex = (storedChunkIndex + 1) * wordsPerChunk - 1;
    if (((maskData[lastWordIndex]! & paddingBits) >>> 0) !== 0) {
      throw new Error(
        `VEGFILE layer ${layerId} contains set padding bits in chunk ${storedChunkIndex}.`,
      );
    }
  }
}

function readHeightValueBits(data: DataView): HeightValueBits {
  const valueBits = data.getUint8(VEG_HEADER_OFFSET.heightValueBits);
  if (valueBits !== 8 && valueBits !== 16 && valueBits !== 32) {
    throw new Error('VEGFILE heightValueBits must be 8, 16 or 32.');
  }
  return valueBits;
}

function readAxis(data: DataView, offset: number, name: string): Axis {
  const axisCode = data.getUint8(offset);
  if (axisCode === 0) return 'x';
  if (axisCode === 1) return 'y';
  if (axisCode === 2) return 'z';
  throw new Error(`VEGFILE ${name} contains invalid axis code ${axisCode}.`);
}

function readPositiveUint32(data: DataView, offset: number, name: string): number {
  const value = data.getUint32(offset, true);
  if (value === 0) throw new Error(`VEGFILE ${name} must be positive.`);
  return value;
}

function readFiniteFloat32(data: DataView, offset: number, name: string): number {
  const value = data.getFloat32(offset, true);
  assertFinite(value, name);
  return value;
}

function readFinitePositiveFloat32(data: DataView, offset: number, name: string): number {
  const value = readFiniteFloat32(data, offset, name);
  if (value <= 0) throw new Error(`VEGFILE ${name} must be greater than zero.`);
  return value;
}

function validateZeroBytes(data: DataView, start: number, end: number, name: string): void {
  for (let byteOffset = start; byteOffset < end; byteOffset += 1) {
    if (data.getUint8(byteOffset) !== 0) throw new Error(`VEGFILE ${name} must be zero.`);
  }
}

function validateSectionEnd(
  offset: number,
  byteLength: number,
  fileSize: number,
  name: string,
): void {
  const endOffset = checkedAdd(offset, byteLength, `${name} data end`);
  if (endOffset > fileSize) throw new Error(`VEGFILE ${name} data exceeds the declared fileSize.`);
}

function align4(value: number): number {
  return checkedAdd(value, (4 - (value % 4)) % 4, 'aligned offset');
}

function checkedMultiply(first: number, second: number, name: string): number {
  const result = first * second;
  if (!Number.isSafeInteger(result) || result > UINT32_MAX) {
    throw new Error(`VEGFILE ${name} exceeds the unsigned 32-bit size limit.`);
  }
  return result;
}

function checkedAdd(first: number, second: number, name: string): number {
  const result = first + second;
  if (!Number.isSafeInteger(result) || result > UINT32_MAX) {
    throw new Error(`VEGFILE ${name} exceeds the unsigned 32-bit size limit.`);
  }
  return result;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`VEGFILE ${name} must be finite.`);
}
