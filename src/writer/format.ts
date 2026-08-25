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
} as const;
