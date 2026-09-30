import type {
  Bounds3,
  HeightValueBits,
  ModelAxis,
  VegetationLayerId,
} from '../vegfile-format/VegetationFileTypes.js';

export type QuantizedHeightData = Uint8Array | Uint16Array | Uint32Array;

export type ParsedVegHeader = Readonly<{
  version: 2;
  vegetationSeed: number;
  buildFingerprint: Uint8Array;
  fileChecksum: number;
  sourceBounds: Bounds3;
  coordinateSystem: Readonly<{
    upAxis: ModelAxis;
    horizontalAxes: readonly [ModelAxis, ModelAxis];
    unitsPerMeter: number;
  }>;
  grid: Readonly<{
    width: number;
    height: number;
    chunkSize: number;
    originX: number;
    originY: number;
  }>;
  storedChunkCount: number;
  heightMap: Readonly<{
    resolutionPerChunkAxis: number;
    valueBits: HeightValueBits;
    valuesPerChunk: number;
  }>;
}>;

export type ParsedVegLayer = Readonly<{
  vegetationLayerId: VegetationLayerId;
  maskResolutionPerChunkAxis: number;
  maskWordsPerChunk: number;
  /** Chunk-major, bit-packed cells. Bit zero is the least-significant bit. */
  maskData: Uint32Array;
}>;

/**
 * Validated views into one VEGFILE v2 allocation.
 *
 * No mask cells or heights are expanded. Renderer-specific adapters decide
 * which views remain on the CPU and how data is uploaded to a GPU backend.
 */
export type ParsedVegFile = Readonly<{
  bytes: Uint8Array;
  header: ParsedVegHeader;
  /** One entry per possible grid chunk: -1 or a stored chunk index. */
  chunkLookup: Int32Array;
  /** Interleaved [minimumHeight, maximumHeight] Float32 pairs. */
  chunkHeightRanges: Float32Array;
  /** Chunk-major quantized height samples. */
  heightData: QuantizedHeightData;
  layers: readonly ParsedVegLayer[];
}>;
