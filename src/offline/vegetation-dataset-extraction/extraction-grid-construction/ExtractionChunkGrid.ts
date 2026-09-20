import {
  calculateTriangleHorizontalBounds,
  type ExtractionTriangle,
} from '../model-triangle-selection/ExtractionGeometry.js';
import type { VegetationDataset } from '../VegetationExtractionTypes.js';

export type ExtractionChunkGrid = VegetationDataset['grid'];
export type TriangleChunkBins = readonly (readonly ExtractionTriangle[])[];

export function createExtractionChunkGrid(
  heightSurfaceTriangles: readonly ExtractionTriangle[],
  chunkSize: number,
): ExtractionChunkGrid {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const triangle of heightSurfaceTriangles) {
    const triangleBounds = calculateTriangleHorizontalBounds(triangle);
    minimumX = Math.min(minimumX, triangleBounds.minimumX);
    minimumY = Math.min(minimumY, triangleBounds.minimumY);
    maximumX = Math.max(maximumX, triangleBounds.maximumX);
    maximumY = Math.max(maximumY, triangleBounds.maximumY);
  }

  minimumX = snapNearChunkBoundary(minimumX, chunkSize);
  minimumY = snapNearChunkBoundary(minimumY, chunkSize);
  maximumX = snapNearChunkBoundary(maximumX, chunkSize);
  maximumY = snapNearChunkBoundary(maximumY, chunkSize);
  const originX = Math.floor(minimumX / chunkSize) * chunkSize;
  const originY = Math.floor(minimumY / chunkSize) * chunkSize;
  return {
    originX,
    originY,
    width: Math.max(1, Math.ceil((maximumX - originX) / chunkSize)),
    height: Math.max(1, Math.ceil((maximumY - originY) / chunkSize)),
    chunkSize,
  };
}

export function binTrianglesByChunk(
  triangles: readonly ExtractionTriangle[],
  grid: ExtractionChunkGrid,
): TriangleChunkBins {
  const logicalChunkCount = grid.width * grid.height;
  const bins: ExtractionTriangle[][] = Array.from(
    { length: logicalChunkCount },
    () => [],
  );
  for (const triangle of triangles) addTriangleToChunkBins(triangle, bins, grid);
  return bins;
}

function addTriangleToChunkBins(
  triangle: ExtractionTriangle,
  bins: ExtractionTriangle[][],
  grid: ExtractionChunkGrid,
): void {
  const triangleBounds = calculateTriangleHorizontalBounds(triangle);
  const minimumGridX = clamp(
    Math.floor((triangleBounds.minimumX - grid.originX) / grid.chunkSize),
    0,
    grid.width - 1,
  );
  const maximumGridX = clamp(
    Math.ceil((triangleBounds.maximumX - grid.originX) / grid.chunkSize) - 1,
    0,
    grid.width - 1,
  );
  const minimumGridY = clamp(
    Math.floor((triangleBounds.minimumY - grid.originY) / grid.chunkSize),
    0,
    grid.height - 1,
  );
  const maximumGridY = clamp(
    Math.ceil((triangleBounds.maximumY - grid.originY) / grid.chunkSize) - 1,
    0,
    grid.height - 1,
  );
  for (let gridY = minimumGridY; gridY <= maximumGridY; gridY += 1) {
    for (let gridX = minimumGridX; gridX <= maximumGridX; gridX += 1) {
      bins[gridY * grid.width + gridX]!.push(triangle);
    }
  }
}

function snapNearChunkBoundary(value: number, chunkSize: number): number {
  const chunkCoordinate = value / chunkSize;
  const nearestBoundary = Math.round(chunkCoordinate);
  if (Math.abs(chunkCoordinate - nearestBoundary) > 1e-5) return value;
  return nearestBoundary === 0 ? 0 : nearestBoundary * chunkSize;
}

function clamp(value: number, minimumValue: number, maximumValue: number): number {
  return Math.min(maximumValue, Math.max(minimumValue, value));
}
