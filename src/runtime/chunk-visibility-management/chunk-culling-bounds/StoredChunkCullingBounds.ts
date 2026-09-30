import type { ModelAxis } from '../../../shared/vegfile-format/VegetationFileTypes.js';
import type { PreparedVegetationDataset } from '../../dataset-preparation/dataset-construction/PreparedVegetationDataset.js';
import type { ParsedVegFile } from '../../../shared/vegfile-parsing/ParsedVegFileTypes.js';
import type { VegetationLayerCullingBounds } from '../../dataset-preparation/layer-profile-preparation/VegetationLayerPreparation.js';
import type { StoredChunkCullingBounds } from '../frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';

const COORDINATES_PER_BOUNDING_BOX = 6;

/** Builds one model-local bounding box for each stored vegetation chunk. */
export function createStoredChunkCullingBounds(
  file: ParsedVegFile,
  storedChunkGridCoordinateLookup: Uint32Array,
  cullingBounds: VegetationLayerCullingBounds,
): StoredChunkCullingBounds {
  validatePadding(cullingBounds.horizontalPaddingMeters, 'horizontal');
  validatePadding(cullingBounds.belowSurfaceMeters, 'below');
  validatePadding(cullingBounds.aboveSurfaceMeters, 'above');
  const unitsPerMeter = file.header.coordinateSystem.unitsPerMeter;
  const horizontalPaddingUnits = cullingBounds.horizontalPaddingMeters * unitsPerMeter;
  const belowPaddingUnits = cullingBounds.belowSurfaceMeters * unitsPerMeter;
  const abovePaddingUnits = cullingBounds.aboveSurfaceMeters * unitsPerMeter;
  const minimumMaximumCoordinates = new Float32Array(
    file.header.storedChunkCount * COORDINATES_PER_BOUNDING_BOX,
  );
  const { grid } = file.header;
  const [horizontalAxisA, horizontalAxisB] = file.header.coordinateSystem.horizontalAxes;
  const upAxis = file.header.coordinateSystem.upAxis;

  for (let storedChunkIndex = 0; storedChunkIndex < file.header.storedChunkCount; storedChunkIndex += 1) {
    const gridCoordinateOffset = storedChunkIndex * 2;
    const gridX = storedChunkGridCoordinateLookup[gridCoordinateOffset]!;
    const gridY = storedChunkGridCoordinateLookup[gridCoordinateOffset + 1]!;
    const horizontalAMinimum = grid.originX + gridX * grid.chunkSize;
    const horizontalBMinimum = grid.originY + gridY * grid.chunkSize;
    const boundingBoxOffset = storedChunkIndex * COORDINATES_PER_BOUNDING_BOX;
    setBoundingBoxAxis(
      minimumMaximumCoordinates,
      boundingBoxOffset,
      horizontalAxisA,
      horizontalAMinimum - horizontalPaddingUnits,
      horizontalAMinimum + grid.chunkSize + horizontalPaddingUnits,
    );
    setBoundingBoxAxis(
      minimumMaximumCoordinates,
      boundingBoxOffset,
      horizontalAxisB,
      horizontalBMinimum - horizontalPaddingUnits,
      horizontalBMinimum + grid.chunkSize + horizontalPaddingUnits,
    );
    setBoundingBoxAxis(
      minimumMaximumCoordinates,
      boundingBoxOffset,
      upAxis,
      file.chunkHeightRanges[storedChunkIndex * 2]! - belowPaddingUnits,
      file.chunkHeightRanges[storedChunkIndex * 2 + 1]! + abovePaddingUnits,
    );
  }

  return {
    storedChunkCount: file.header.storedChunkCount,
    minimumMaximumCoordinates,
  };
}

/** Uses the largest prepared layer bounds for one shared coarse culling pass. */
export function createDatasetStoredChunkCullingBounds(
  dataset: PreparedVegetationDataset,
): StoredChunkCullingBounds {
  return createStoredChunkCullingBounds(
    dataset.file,
    dataset.storedChunkGridCoordinateLookup,
    dataset.combinedCullingBounds,
  );
}

function setBoundingBoxAxis(
  minimumMaximumCoordinates: Float32Array,
  boundingBoxOffset: number,
  axis: ModelAxis,
  minimum: number,
  maximum: number,
): void {
  const axisOffset = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  minimumMaximumCoordinates[boundingBoxOffset + axisOffset] = minimum;
  minimumMaximumCoordinates[boundingBoxOffset + 3 + axisOffset] = maximum;
}

function validatePadding(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Chunk bounding box ${name} padding must be a non-negative finite number.`,
    );
  }
}
