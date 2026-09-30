import type { Bounds3 } from '../glb-model-reading/ModelInputTypes.js';
import type {
  ModelAxis,
  VegetationLayerId,
} from '../../shared/vegfile-format/VegetationFileTypes.js';

export type ExtractedVegetationLayer = Readonly<{
  vegetationLayerId: VegetationLayerId;
  vegetationLayerKey: string;
  maskResolutionPerChunkAxis: number;
  /** Chunk-major logical cells. Every value is exactly 0 or 1. */
  maskData: Uint8Array;
}>;

export type StoredChunkHeightRange = Readonly<{
  minimumHeight: number;
  maximumHeight: number;
}>;

/**
 * File-format-independent output of the extractor.
 *
 * heightData layout:
 *   storedChunkIndex * heightMapResolutionPerChunkAxis² + sampleIndex
 *
 * layer.maskData layout:
 *   storedChunkIndex * layer.maskResolutionPerChunkAxis² + cellIndex
 */
export type VegetationDataset = Readonly<{
  /** Complete model-local bounds of the included source geometry. */
  sourceBounds: Bounds3;
  coordinateSystem: Readonly<{
    upAxis: ModelAxis;
    horizontalAxes: readonly [ModelAxis, ModelAxis];
    unitsPerMeter: number;
  }>;
  vegetationSeed: number;
  grid: Readonly<{
    originX: number;
    originY: number;
    width: number;
    height: number;
    chunkSize: number;
  }>;
  heightMap: Readonly<{
    resolutionPerChunkAxis: number;
  }>;
  layers: readonly ExtractedVegetationLayer[];
  chunkLookup: Int32Array;
  /** One range per stored chunk, indexed by chunkLookup values. */
  storedChunkHeightRanges: readonly StoredChunkHeightRange[];
  /** Unquantized height samples; quantization is the writer's responsibility. */
  heightData: Float64Array;
}>;
