import type { Axis } from '../../offline/config/types.js';
import type { VegetationRenderBounds } from '../config/types.js';
import type { VegetationRuntimeDataset } from '../dataset/types.js';
import type { ParsedVegFile } from '../parser/types.js';
import type { ChunkBoundingBoxes } from './types.js';

const COORDINATES_PER_BOUNDING_BOX = 6;

/** Builds one model-local bounding box for each stored vegetation chunk. */
export function createChunkBoundingBoxes(
  file: ParsedVegFile,
  renderBounds: VegetationRenderBounds,
): ChunkBoundingBoxes {
  validatePadding(renderBounds.horizontalPaddingMeters, 'horizontal');
  validatePadding(renderBounds.belowSurfaceMeters, 'below');
  validatePadding(renderBounds.aboveSurfaceMeters, 'above');
  const unitsPerMeter = file.header.coordinateSystem.unitsPerMeter;
  const horizontalPaddingUnits = renderBounds.horizontalPaddingMeters * unitsPerMeter;
  const belowPaddingUnits = renderBounds.belowSurfaceMeters * unitsPerMeter;
  const abovePaddingUnits = renderBounds.aboveSurfaceMeters * unitsPerMeter;
  const minMaxCoordinates = new Float32Array(
    file.header.storedChunkCount * COORDINATES_PER_BOUNDING_BOX,
  );
  const { grid } = file.header;
  const [horizontalAxisA, horizontalAxisB] = file.header.coordinateSystem.horizontalAxes;
  const upAxis = file.header.coordinateSystem.upAxis;

  for (let logicalIndex = 0; logicalIndex < file.chunkLookup.length; logicalIndex += 1) {
    const storedChunkIndex = file.chunkLookup[logicalIndex]!;
    if (storedChunkIndex === -1) continue;

    const gridX = logicalIndex % grid.width;
    const gridY = Math.floor(logicalIndex / grid.width);
    const horizontalAMinimum = grid.originX + gridX * grid.chunkSize;
    const horizontalBMinimum = grid.originY + gridY * grid.chunkSize;
    const boundingBoxOffset = storedChunkIndex * COORDINATES_PER_BOUNDING_BOX;
    setBoundingBoxAxis(
      minMaxCoordinates,
      boundingBoxOffset,
      horizontalAxisA,
      horizontalAMinimum - horizontalPaddingUnits,
      horizontalAMinimum + grid.chunkSize + horizontalPaddingUnits,
    );
    setBoundingBoxAxis(
      minMaxCoordinates,
      boundingBoxOffset,
      horizontalAxisB,
      horizontalBMinimum - horizontalPaddingUnits,
      horizontalBMinimum + grid.chunkSize + horizontalPaddingUnits,
    );
    setBoundingBoxAxis(
      minMaxCoordinates,
      boundingBoxOffset,
      upAxis,
      file.chunkHeightRanges[storedChunkIndex * 2]! - belowPaddingUnits,
      file.chunkHeightRanges[storedChunkIndex * 2 + 1]! + abovePaddingUnits,
    );
  }

  return {
    storedChunkCount: file.header.storedChunkCount,
    minMaxCoordinates,
  };
}

/** Uses the largest enabled layer bounds for one shared coarse culling pass. */
export function createRuntimeChunkBoundingBoxes(
  dataset: VegetationRuntimeDataset,
): ChunkBoundingBoxes {
  return createChunkBoundingBoxes(dataset.file, dataset.renderBounds);
}

function setBoundingBoxAxis(
  minMaxCoordinates: Float32Array,
  boundingBoxOffset: number,
  axis: Axis,
  minimum: number,
  maximum: number,
): void {
  const axisOffset = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  minMaxCoordinates[boundingBoxOffset + axisOffset] = minimum;
  minMaxCoordinates[boundingBoxOffset + 3 + axisOffset] = maximum;
}

function validatePadding(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Chunk bounding box ${name} padding must be a non-negative finite number.`,
    );
  }
}
