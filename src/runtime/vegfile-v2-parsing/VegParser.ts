import type { Axis } from '../../offline/offline-compilation-orchestration/VegetationCompilerConfig.js';
import {
  calculateVegFileV2Layout,
  checkedVegFileMultiply,
  type VegFileV2Layout,
} from '../../vegfile-v2-format/VegFileV2Layout.js';
import {
  calculateVegFileChecksum,
  VEG_FILE_BUILD_FINGERPRINT_SIZE,
  VEG_FILE_FORMAT_VERSION,
  VEG_FILE_HEADER_OFFSETS,
  VEG_FILE_HEADER_SIZE,
  VEG_FILE_LAYER_METADATA_SIZE,
  VEG_FILE_MAGIC_BYTES,
} from '../../vegfile-v2-format/VegFileV2Schema.js';
import type { HeightValueBits } from '../../vegfile-v2-format/VegetationFileTypes.js';
import type {
  ParsedVegFile,
  ParsedVegHeader,
  ParsedVegLayer,
  QuantizedHeightData,
} from './ParsedVegetationFile.js';

type OpenVegFile = Readonly<{
  bytes: Uint8Array;
  data: DataView;
}>;

type FileHeader = Readonly<{
  parsedHeader: ParsedVegHeader;
  layerCount: number;
  logicalChunkCount: number;
}>;

type LayerMetadata = Readonly<{
  id: number;
  maskResolution: number;
}>;

/** Reads VEGFILE v2 into validated views without expanding packed data. */
export function parseVegFile(source: ArrayBuffer | Uint8Array): ParsedVegFile {
  const file = openVegFile(source);
  const header = readFileHeader(file);
  const layerMetadata = readLayerMetadata(file, header.layerCount);
  const layout = calculateVegFileV2Layout({
    gridWidth: header.parsedHeader.grid.width,
    gridHeight: header.parsedHeader.grid.height,
    storedChunkCount: header.parsedHeader.storedChunkCount,
    heightResolution: header.parsedHeader.heightMap.resolution,
    heightValueBits: header.parsedHeader.heightMap.valueBits,
    layerMaskResolutions: layerMetadata.map((layer) => layer.maskResolution),
  });

  validateFileLength(file.bytes.byteLength, layout.fileByteLength);
  validateHeightAlignmentPadding(file.data, layout);

  const chunkLookup = createChunkLookupView(file, header, layout);
  const chunkHeightRanges = createChunkHeightRangeView(file, header, layout);
  const heightData = createHeightDataView(file, header, layout);
  const layers = createVegetationLayers(file, header, layerMetadata, layout);
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
  if (bytes.byteLength < VEG_FILE_HEADER_SIZE) {
    throw new Error(
      `VEGFILE is truncated: expected at least ${VEG_FILE_HEADER_SIZE} header bytes.`,
    );
  }
  return {
    bytes,
    data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  };
}

function readFileHeader(file: OpenVegFile): FileHeader {
  validateFileIdentity(file.data);
  const { data } = file;
  const grid = {
    width: readPositiveUint32(data, VEG_FILE_HEADER_OFFSETS.gridWidth, 'gridWidth'),
    height: readPositiveUint32(data, VEG_FILE_HEADER_OFFSETS.gridHeight, 'gridHeight'),
    chunkSize: readFinitePositiveFloat32(
      data,
      VEG_FILE_HEADER_OFFSETS.chunkSize,
      'chunkSize',
    ),
    originX: readFiniteFloat32(data, VEG_FILE_HEADER_OFFSETS.gridOriginX, 'gridOriginX'),
    originY: readFiniteFloat32(data, VEG_FILE_HEADER_OFFSETS.gridOriginY, 'gridOriginY'),
  };
  const heightResolution = data.getUint16(VEG_FILE_HEADER_OFFSETS.heightResolution, true);
  if (heightResolution < 2) {
    throw new Error('VEGFILE heightResolution must be at least 2.');
  }
  const storedChunkCount = readPositiveUint32(
    data,
    VEG_FILE_HEADER_OFFSETS.storedChunkCount,
    'storedChunkCount',
  );
  const layerCount = readPositiveUint32(
    data,
    VEG_FILE_HEADER_OFFSETS.layerCount,
    'layerCount',
  );
  const heightValueBits = readHeightValueBits(data);

  return {
    parsedHeader: {
      version: 2,
      seed: data.getUint32(VEG_FILE_HEADER_OFFSETS.seed, true),
      buildFingerprint: file.bytes.subarray(
        VEG_FILE_HEADER_OFFSETS.buildFingerprint,
        VEG_FILE_HEADER_OFFSETS.buildFingerprint + VEG_FILE_BUILD_FINGERPRINT_SIZE,
      ),
      fileChecksum: data.getUint32(VEG_FILE_HEADER_OFFSETS.fileChecksum, true),
      sourceBounds: readSourceBounds(data),
      coordinateSystem: readCoordinateSystem(data),
      grid,
      storedChunkCount,
      heightMap: {
        resolution: heightResolution,
        valueBits: heightValueBits,
        valuesPerChunk: checkedVegFileMultiply(
          heightResolution,
          heightResolution,
          'height values per chunk',
        ),
      },
    },
    layerCount,
    logicalChunkCount: checkedVegFileMultiply(
      grid.width,
      grid.height,
      'logical chunk count',
    ),
  };
}

function readSourceBounds(data: DataView): ParsedVegHeader['sourceBounds'] {
  const sourceBounds = {
    minX: data.getFloat32(VEG_FILE_HEADER_OFFSETS.sourceBounds, true),
    minY: data.getFloat32(VEG_FILE_HEADER_OFFSETS.sourceBounds + 4, true),
    minZ: data.getFloat32(VEG_FILE_HEADER_OFFSETS.sourceBounds + 8, true),
    maxX: data.getFloat32(VEG_FILE_HEADER_OFFSETS.sourceBounds + 12, true),
    maxY: data.getFloat32(VEG_FILE_HEADER_OFFSETS.sourceBounds + 16, true),
    maxZ: data.getFloat32(VEG_FILE_HEADER_OFFSETS.sourceBounds + 20, true),
  };
  for (const boundValue of Object.values(sourceBounds)) {
    if (!Number.isFinite(boundValue)) {
      throw new Error('VEGFILE sourceBounds must be finite.');
    }
  }
  if (
    sourceBounds.minX > sourceBounds.maxX
    || sourceBounds.minY > sourceBounds.maxY
    || sourceBounds.minZ > sourceBounds.maxZ
  ) {
    throw new Error('VEGFILE sourceBounds are invalid.');
  }
  return sourceBounds;
}

function validateFileIdentity(data: DataView): void {
  for (let index = 0; index < VEG_FILE_MAGIC_BYTES.length; index += 1) {
    if (data.getUint8(VEG_FILE_HEADER_OFFSETS.magic + index) !== VEG_FILE_MAGIC_BYTES[index]) {
      throw new Error('Invalid VEGFILE signature; expected "VEGFILE\\0".');
    }
  }
  const version = data.getUint16(VEG_FILE_HEADER_OFFSETS.version, true);
  if (version !== VEG_FILE_FORMAT_VERSION) {
    throw new Error(`Unsupported .veg file version ${version}; expected version 2.`);
  }
}

function readCoordinateSystem(data: DataView): ParsedVegHeader['coordinateSystem'] {
  const upAxis = readAxis(data, VEG_FILE_HEADER_OFFSETS.upAxis, 'upAxis');
  const horizontalAxisX = readAxis(
    data,
    VEG_FILE_HEADER_OFFSETS.horizontalAxisX,
    'horizontalAxisX',
  );
  const horizontalAxisY = readAxis(
    data,
    VEG_FILE_HEADER_OFFSETS.horizontalAxisY,
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
      VEG_FILE_HEADER_OFFSETS.unitsPerMeter,
      'unitsPerMeter',
    ),
  };
}

function readLayerMetadata(
  file: OpenVegFile,
  layerCount: number,
): readonly LayerMetadata[] {
  const metadataByteLength = checkedVegFileMultiply(
    layerCount,
    VEG_FILE_LAYER_METADATA_SIZE,
    'layer metadata size',
  );
  if (VEG_FILE_HEADER_SIZE + metadataByteLength > file.bytes.byteLength) {
    throw new Error('VEGFILE is truncated inside the layer metadata section.');
  }

  const layers: LayerMetadata[] = [];
  const layerIds = new Set<number>();
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const metadataOffset = VEG_FILE_HEADER_SIZE
      + layerIndex * VEG_FILE_LAYER_METADATA_SIZE;
    const id = file.data.getUint32(metadataOffset, true);
    if (layerIds.has(id)) throw new Error(`VEGFILE layer ID ${id} is duplicated.`);
    layerIds.add(id);
    const maskResolution = file.data.getUint16(metadataOffset + 4, true);
    if (maskResolution < 1) {
      throw new Error(`VEGFILE layer ${id} maskResolution must be positive.`);
    }
    if (file.data.getUint16(metadataOffset + 6, true) !== 0) {
      throw new Error(`VEGFILE layer ${id} metadata padding must be zero.`);
    }
    layers.push({ id, maskResolution });
  }
  return layers;
}

function validateFileLength(actualByteLength: number, expectedByteLength: number): void {
  if (actualByteLength !== expectedByteLength) {
    throw new Error(
      `VEGFILE byte length ${actualByteLength} must be ${expectedByteLength}.`,
    );
  }
}

function validateHeightAlignmentPadding(data: DataView, layout: VegFileV2Layout): void {
  const heightDataEnd = layout.heightDataOffset + layout.heightDataByteLength;
  for (let byteOffset = heightDataEnd;
    byteOffset < layout.vegetationMaskDataOffset;
    byteOffset += 1) {
    if (data.getUint8(byteOffset) !== 0) {
      throw new Error('VEGFILE height alignment padding must be zero.');
    }
  }
}

function validateFileChecksum(bytes: Uint8Array, storedChecksum: number): void {
  const calculatedChecksum = calculateVegFileChecksum(bytes);
  if (storedChecksum !== calculatedChecksum) {
    throw new Error(
      `VEGFILE checksum ${storedChecksum} does not match calculated ${calculatedChecksum}.`,
    );
  }
}

function createChunkLookupView(
  file: OpenVegFile,
  header: FileHeader,
  layout: VegFileV2Layout,
): Int32Array {
  return new Int32Array(
    file.bytes.buffer,
    file.bytes.byteOffset + layout.chunkLookupOffset,
    header.logicalChunkCount,
  );
}

function createChunkHeightRangeView(
  file: OpenVegFile,
  header: FileHeader,
  layout: VegFileV2Layout,
): Float32Array {
  return new Float32Array(
    file.bytes.buffer,
    file.bytes.byteOffset + layout.chunkHeightRangesOffset,
    header.parsedHeader.storedChunkCount * 2,
  );
}

function createHeightDataView(
  file: OpenVegFile,
  header: FileHeader,
  layout: VegFileV2Layout,
): QuantizedHeightData {
  const byteOffset = file.bytes.byteOffset + layout.heightDataOffset;
  const valueBits = header.parsedHeader.heightMap.valueBits;
  if (valueBits === 8) {
    return new Uint8Array(file.bytes.buffer, byteOffset, layout.heightValueCount);
  }
  if (valueBits === 16) {
    return new Uint16Array(file.bytes.buffer, byteOffset, layout.heightValueCount);
  }
  return new Uint32Array(file.bytes.buffer, byteOffset, layout.heightValueCount);
}

function createVegetationLayers(
  file: OpenVegFile,
  header: FileHeader,
  layerMetadata: readonly LayerMetadata[],
  layout: VegFileV2Layout,
): readonly ParsedVegLayer[] {
  return layerMetadata.map((metadata, layerIndex) => {
    const layerLayout = layout.layers[layerIndex]!;
    const maskData = new Uint32Array(
      file.bytes.buffer,
      file.bytes.byteOffset + layerLayout.maskDataOffset,
      layerLayout.maskDataByteLength / 4,
    );
    validateMaskPaddingBits(
      maskData,
      header.parsedHeader.storedChunkCount,
      layerLayout.wordsPerChunk,
      layerLayout.cellsPerChunk,
      metadata.id,
    );
    return {
      id: metadata.id,
      maskResolution: metadata.maskResolution,
      maskWordsPerChunk: layerLayout.wordsPerChunk,
      maskData,
    };
  });
}

function validateChunkLookup(chunkLookup: Int32Array, storedChunkCount: number): void {
  const referencedStoredChunks = new Uint8Array(storedChunkCount);
  for (const storedChunkIndex of chunkLookup) {
    if (storedChunkIndex === -1) continue;
    if (storedChunkIndex < 0 || storedChunkIndex >= storedChunkCount) {
      throw new Error(
        `VEGFILE chunkLookup contains invalid stored index ${storedChunkIndex}.`,
      );
    }
    if (referencedStoredChunks[storedChunkIndex] === 1) {
      throw new Error(
        `VEGFILE chunkLookup references stored index ${storedChunkIndex} more than once.`,
      );
    }
    referencedStoredChunks[storedChunkIndex] = 1;
  }
  if (referencedStoredChunks.some((value) => value === 0)) {
    throw new Error('VEGFILE chunkLookup must reference every stored chunk exactly once.');
  }
}

function validateChunkHeightRanges(heightRanges: Float32Array): void {
  for (let storedChunkIndex = 0;
    storedChunkIndex < heightRanges.length / 2;
    storedChunkIndex += 1) {
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
  for (let storedChunkIndex = 0;
    storedChunkIndex < storedChunkCount;
    storedChunkIndex += 1) {
    const lastWordIndex = (storedChunkIndex + 1) * wordsPerChunk - 1;
    if (((maskData[lastWordIndex]! & paddingBits) >>> 0) !== 0) {
      throw new Error(
        `VEGFILE layer ${layerId} contains set padding bits in chunk ${storedChunkIndex}.`,
      );
    }
  }
}

function readHeightValueBits(data: DataView): HeightValueBits {
  const valueBits = data.getUint8(VEG_FILE_HEADER_OFFSETS.heightValueBits);
  if (valueBits !== 8 && valueBits !== 16 && valueBits !== 32) {
    throw new Error('VEGFILE heightValueBits must be 8, 16 or 32.');
  }
  return valueBits;
}

function readAxis(data: DataView, byteOffset: number, name: string): Axis {
  const axisCode = data.getUint8(byteOffset);
  if (axisCode === 0) return 'x';
  if (axisCode === 1) return 'y';
  if (axisCode === 2) return 'z';
  throw new Error(`VEGFILE ${name} contains invalid axis code ${axisCode}.`);
}

function readPositiveUint32(data: DataView, byteOffset: number, name: string): number {
  const value = data.getUint32(byteOffset, true);
  if (value === 0) throw new Error(`VEGFILE ${name} must be positive.`);
  return value;
}

function readFiniteFloat32(data: DataView, byteOffset: number, name: string): number {
  const value = data.getFloat32(byteOffset, true);
  if (!Number.isFinite(value)) throw new Error(`VEGFILE ${name} must be finite.`);
  return value;
}

function readFinitePositiveFloat32(
  data: DataView,
  byteOffset: number,
  name: string,
): number {
  const value = readFiniteFloat32(data, byteOffset, name);
  if (value <= 0) throw new Error(`VEGFILE ${name} must be greater than zero.`);
  return value;
}
