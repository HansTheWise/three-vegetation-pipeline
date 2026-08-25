export const VEG_MAGIC_BYTES = [
  0x56, 0x45, 0x47, 0x46, 0x49, 0x4c, 0x45, 0x00,
] as const;

/**
 * VEGFILE v1 uses a fixed 128-byte little-endian header followed by:
 * layer metadata, chunk lookup, chunk metadata, quantized heights and the
 * independently sized bit-packed mask section of every layer.
 */
export const VEG_FORMAT_VERSION = 1;
export const VEG_HEADER_SIZE = 128;
export const VEG_LAYER_METADATA_SIZE = 16;
export const VEG_CHUNK_METADATA_SIZE = 8;
export const VEG_BUILD_FINGERPRINT_SIZE = 16;

export const VEG_HEADER_OFFSET = {
  magic: 0,
  version: 8,
  headerSize: 10,
  flags: 12,
  fileSize: 16,
  gridWidth: 20,
  gridHeight: 24,
  storedChunkCount: 28,
  layerCount: 32,
  seed: 36,
  chunkSize: 40,
  gridOriginX: 44,
  gridOriginY: 48,
  unitsPerMeter: 52,
  sourceBounds: 56,
  upAxis: 80,
  horizontalAxisX: 81,
  horizontalAxisY: 82,
  heightValueBits: 83,
  heightResolution: 84,
  layerMetadata: 88,
  chunkLookup: 92,
  chunkMetadata: 96,
  heightData: 100,
  vegetationMaskData: 104,
  buildFingerprint: 108,
  fileChecksum: 124,
} as const;

const CRC32_TABLE = createCrc32Table();

/** Calculates the VEGFILE CRC32 with its own header field treated as zero. */
export function calculateVegChecksum(bytes: Uint8Array): number {
  let checksum = 0xffff_ffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = index >= VEG_HEADER_OFFSET.fileChecksum
      && index < VEG_HEADER_OFFSET.fileChecksum + 4
      ? 0
      : bytes[index]!;
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
