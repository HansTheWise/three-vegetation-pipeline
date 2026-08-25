import type { Axis } from '../config/types.js';
import type { Bounds3 } from '../reader/types.js';

export type ExtractedVegetationLayer = Readonly<{
  id: number;
  key: string;
  displayName: string;
  maskResolution: number;
  activeCellCount: number;
  /** Chunk-major logical cells. Every value is exactly 0 or 1. */
  maskData: Uint8Array;
}>;

export type ExtractedChunk = Readonly<{
  gridX: number;
  gridY: number;
  minimumHeight: number;
  maximumHeight: number;
}>;

/**
 * File-format-independent output of the extractor.
 *
 * heightData layout:
 *   storedChunkIndex * heightResolution² + sampleIndex
 *
 * layer.maskData layout:
 *   storedChunkIndex * layer.maskResolution² + cellIndex
 */
export type VegetationDataset = Readonly<{
  sourceBounds: Bounds3;
  coordinateSystem: Readonly<{
    upAxis: Axis;
    horizontalAxes: readonly [Axis, Axis];
    unitsPerMeter: number;
  }>;
  seed: number;
  grid: Readonly<{
    originX: number;
    originY: number;
    width: number;
    height: number;
    chunkSize: number;
  }>;
  heightMap: Readonly<{
    resolution: number;
  }>;
  layers: readonly ExtractedVegetationLayer[];
  chunkLookup: Int32Array;
  chunks: readonly ExtractedChunk[];
  /** Unquantized height samples; quantization is the writer's responsibility. */
  heightData: Float64Array;
}>;

export type VegetationExtractorOptions = Readonly<{
  generateSeed?: () => number;
}>;
