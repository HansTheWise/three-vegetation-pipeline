import type {
  ChunkedExtractionTriangles,
  ChunkedVegetationLayerTriangles,
} from '../extraction-grid-construction/ExtractionChunkGrid.js';
import {
  extractChunkHeightMap,
} from '../chunk-heightmap-extraction/ChunkHeightMapExtraction.js';
import type {
  VegetationDataset,
} from '../VegetationExtractionTypes.js';
import {
  assertLayerMasksDoNotOverlap,
  hasActiveMaskCell,
  rasterizeVegetationMask,
  removeExcludedCellsFromMask,
} from '../vegetation-mask-extraction/VegetationMaskExtraction.js';

export function extractStoredVegetationChunks(
  chunkedTriangles: ChunkedExtractionTriangles,
  heightMapResolutionPerChunkAxis: number,
  allowVegetationLayerOverlap: boolean,
): StoredVegetationChunkExtraction {
  const { chunkGrid } = chunkedTriangles;
  const logicalChunkCount = chunkGrid.width * chunkGrid.height;
  if (!Number.isSafeInteger(logicalChunkCount)) {
    throw new Error('Chunk grid size exceeds the JavaScript safe integer range.');
  }

  const layerContainsActiveCells = new Array<boolean>(
    chunkedTriangles.vegetationLayers.length,
  ).fill(false);
  const chunkLookup = new Int32Array(logicalChunkCount).fill(-1);
  const storedChunkHeightRanges: VegetationDataset['storedChunkHeightRanges'][number][] = [];
  const storedChunkHeightMaps: Float64Array[] = [];
  const storedChunkLayerMasks: Uint8Array[][] = [];

  for (
    let logicalChunkIndex = 0;
    logicalChunkIndex < logicalChunkCount;
    logicalChunkIndex += 1
  ) {
    const chunkGridX = logicalChunkIndex % chunkGrid.width;
    const chunkGridY = Math.floor(logicalChunkIndex / chunkGrid.width);
    const chunkOriginX = chunkGrid.originX + chunkGridX * chunkGrid.chunkSize;
    const chunkOriginY = chunkGrid.originY + chunkGridY * chunkGrid.chunkSize;
    const layerMasks = extractChunkLayerMasks(
      chunkedTriangles.vegetationLayers,
      layerContainsActiveCells,
      logicalChunkIndex,
      chunkOriginX,
      chunkOriginY,
      chunkGrid.chunkSize,
    );

    assertLayerMasksDoNotOverlap(
      layerMasks,
      chunkedTriangles.vegetationLayers.map(({ config }) => config),
      allowVegetationLayerOverlap,
      chunkGridX,
      chunkGridY,
    );
    if (!layerMasks.some(hasActiveMaskCell)) continue;

    const heightSurfaceTriangles = (
      chunkedTriangles.heightSurfaceTriangleBins[logicalChunkIndex] ?? []
    );
    if (heightSurfaceTriangles.length === 0) {
      throw new Error(
        `Stored chunk (${chunkGridX}, ${chunkGridY}) has no height triangles.`,
      );
    }

    const chunkHeightMap = extractChunkHeightMap(
      heightSurfaceTriangles,
      chunkOriginX,
      chunkOriginY,
      chunkGrid.chunkSize,
      heightMapResolutionPerChunkAxis,
    );
    chunkLookup[logicalChunkIndex] = storedChunkHeightRanges.length;
    storedChunkHeightRanges.push({
      minimumHeight: chunkHeightMap.minimumHeight,
      maximumHeight: chunkHeightMap.maximumHeight,
    });
    storedChunkHeightMaps.push(chunkHeightMap.sampleHeights);
    storedChunkLayerMasks.push(layerMasks);
  }

  assertEveryVegetationLayerContainsCells(
    chunkedTriangles.vegetationLayers,
    layerContainsActiveCells,
  );

  return {
    chunkLookup,
    storedChunkHeightRanges,
    storedChunkHeightMaps,
    storedChunkLayerMasks,
  };
}

function extractChunkLayerMasks(
  vegetationLayers: readonly ChunkedVegetationLayerTriangles[],
  layerContainsActiveCells: boolean[],
  logicalChunkIndex: number,
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
): Uint8Array[] {
  return vegetationLayers.map((layer, layerIndex) => {
    const vegetationMask = rasterizeVegetationMask(
      layer.vegetationTriangleBins[logicalChunkIndex] ?? [],
      chunkOriginX,
      chunkOriginY,
      chunkSize,
      layer.config.maskResolutionPerChunkAxis,
    );
    removeExcludedCellsFromMask(
      vegetationMask,
      layer.exclusionTriangleBins[logicalChunkIndex] ?? [],
      chunkOriginX,
      chunkOriginY,
      chunkSize,
      layer.config.maskResolutionPerChunkAxis,
    );
    if (hasActiveMaskCell(vegetationMask)) {
      layerContainsActiveCells[layerIndex] = true;
    }
    return vegetationMask;
  });
}

function assertEveryVegetationLayerContainsCells(
  vegetationLayers: readonly ChunkedVegetationLayerTriangles[],
  layerContainsActiveCells: readonly boolean[],
): void {
  for (let layerIndex = 0; layerIndex < vegetationLayers.length; layerIndex += 1) {
    if (layerContainsActiveCells[layerIndex]) continue;
    throw new Error(
      `Vegetation layer "${vegetationLayers[layerIndex]!.config.vegetationLayerKey}" is empty.`,
    );
  }
}

export type StoredVegetationChunkExtraction = Readonly<{
  chunkLookup: Int32Array;
  storedChunkHeightRanges: VegetationDataset['storedChunkHeightRanges'];
  storedChunkHeightMaps: readonly Float64Array[];
  storedChunkLayerMasks: readonly (readonly Uint8Array[])[];
}>;
