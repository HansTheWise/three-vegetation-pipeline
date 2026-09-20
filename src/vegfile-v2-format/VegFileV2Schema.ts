export const VEG_FILE_MAGIC_BYTES = [
  0x56, 0x45, 0x47, 0x46, 0x49, 0x4c, 0x45, 0x00,
] as const;

export const VEG_FILE_FORMAT_VERSION = 2;
export const VEG_FILE_HEADER_SIZE = 96;
export const VEG_FILE_LAYER_METADATA_SIZE = 8;
export const VEG_FILE_CHUNK_HEIGHT_RANGE_SIZE = 8;
export const VEG_FILE_BUILD_FINGERPRINT_SIZE = 16;

/** Byte offsets of the fixed VEGFILE v2 header fields. */
export const VEG_FILE_HEADER_OFFSETS = {
  magic: 0,
  version: 8,
  heightResolution: 10,
  gridWidth: 12,
  gridHeight: 16,
  storedChunkCount: 20,
  layerCount: 24,
  seed: 28,
  chunkSize: 32,
  gridOriginX: 36,
  gridOriginY: 40,
  unitsPerMeter: 44,
  sourceBounds: 48,
  upAxis: 72,
  horizontalAxisX: 73,
  horizontalAxisY: 74,
  heightValueBits: 75,
  buildFingerprint: 76,
  fileChecksum: 92,
} as const;

const CRC32_TABLE = createCrc32Table();

/** Calculates the VEGFILE CRC32 with its own header field treated as zero. */
export function calculateVegFileChecksum(bytes: Uint8Array): number {
  let checksum = 0xffff_ffff;
  for (let byteOffset = 0; byteOffset < bytes.length; byteOffset += 1) {
    const byte = byteOffset >= VEG_FILE_HEADER_OFFSETS.fileChecksum
      && byteOffset < VEG_FILE_HEADER_OFFSETS.fileChecksum + 4
      ? 0
      : bytes[byteOffset]!;
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff]! ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffff_ffff) >>> 0;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}
