import type {
  ResolvedVegetationExtractionConfig,
} from '../configuration/VegetationCompilerConfig.js';
import type { Bounds3, ModelData } from '../glb-model-reading/ModelInputTypes.js';
import {
  concatenateChunkHeightMaps,
} from './chunk-heightmap-extraction/ChunkHeightMapExtraction.js';
import {
  partitionExtractionTrianglesIntoChunks,
  type ChunkedExtractionTriangles,
} from './extraction-grid-construction/ExtractionChunkGrid.js';
import {
  selectModelTrianglesForExtraction,
  type SelectedExtractionTriangles,
} from './model-triangle-selection/ModelTriangleSelection.js';
import {
  extractStoredVegetationChunks,
  type StoredVegetationChunkExtraction,
} from './stored-chunk-extraction/StoredVegetationChunkExtraction.js';
import {
  concatenateStoredLayerMasks,
} from './vegetation-mask-extraction/VegetationMaskExtraction.js';
import type { VegetationDataset } from './VegetationExtractionTypes.js';

/** Converts neutral model data into file-format-independent vegetation data. */
export function extractVegetation(
  modelData: ModelData,
  vegetationExtractionConfig: ResolvedVegetationExtractionConfig,
): VegetationDataset {
  const sourceBounds: Bounds3 | null = modelData.modelLocalBounds;

  if (!sourceBounds) {
    throw new Error('Cannot extract vegetation from an empty model.');
  }

  if (vegetationExtractionConfig.vegetationLayers.length === 0) {
    throw new Error('No vegetation layers configured.');
  }

  const selectedTriangles: SelectedExtractionTriangles =
    selectModelTrianglesForExtraction(
      modelData.primitives,
      vegetationExtractionConfig,
    );

  if (selectedTriangles.heightSurfaceTriangles.length === 0) {
    throw new Error('Height surface selector did not match any triangles.');
  }

  const chunkedTriangles: ChunkedExtractionTriangles =
    partitionExtractionTrianglesIntoChunks(
      selectedTriangles,
      vegetationExtractionConfig.grid.chunkSize,
    );

  const storedVegetationChunks: StoredVegetationChunkExtraction =
    extractStoredVegetationChunks(
      chunkedTriangles,
      vegetationExtractionConfig.heightMap.resolutionPerChunkAxis,
      vegetationExtractionConfig.allowVegetationLayerOverlap,
    );

  return createVegetationDataset(
    sourceBounds,
    vegetationExtractionConfig,
    chunkedTriangles,
    storedVegetationChunks,
  );
}

function createVegetationDataset(
  sourceBounds: Bounds3,
  vegetationExtractionConfig: ResolvedVegetationExtractionConfig,
  chunkedTriangles: ChunkedExtractionTriangles,
  storedVegetationChunks: StoredVegetationChunkExtraction,
): VegetationDataset {
  return {
    sourceBounds,
    coordinateSystem: {
      upAxis: vegetationExtractionConfig.coordinateSystem.upAxis,
      horizontalAxes: vegetationExtractionConfig.coordinateSystem.horizontalAxes,
      unitsPerMeter: vegetationExtractionConfig.coordinateSystem.unitsPerMeter,
    },
    vegetationSeed: vegetationExtractionConfig.vegetationSeed,
    grid: chunkedTriangles.chunkGrid,
    heightMap: {
      resolutionPerChunkAxis:
        vegetationExtractionConfig.heightMap.resolutionPerChunkAxis,
    },
    layers: chunkedTriangles.vegetationLayers.map((layer, layerIndex) => ({
      vegetationLayerId: layer.config.vegetationLayerId,
      vegetationLayerKey: layer.config.vegetationLayerKey,
      maskResolutionPerChunkAxis: layer.config.maskResolutionPerChunkAxis,
      maskData: concatenateStoredLayerMasks(
        storedVegetationChunks.storedChunkLayerMasks,
        layerIndex,
        layer.config.maskResolutionPerChunkAxis ** 2,
      ),
    })),
    chunkLookup: storedVegetationChunks.chunkLookup,
    storedChunkHeightRanges: storedVegetationChunks.storedChunkHeightRanges,
    heightData: concatenateChunkHeightMaps(
      storedVegetationChunks.storedChunkHeightMaps,
    ),
  };
}
