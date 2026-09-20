import type { Axis } from '../../../offline/offline-compilation-orchestration/VegetationCompilerConfig.js';
import { FrustumPlanes } from '../../../runtime/stored-chunk-visibility/frustum-visibility-evaluation/FrustumPlanes.js';
import type { ClipSpaceDepthRange, Matrix4Elements } from '../../../runtime/stored-chunk-visibility/frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';
import { evaluateVegetationDensityCurve } from './evaluateVegetationDensityCurve.js';
import type { VegetationRuntimeLayerConfig } from '../../../runtime/runtime-dataset-preparation/configuration/VegetationRuntimeConfig.js';
import type { VegetationRuntimeDataset, VegetationRuntimeLayer } from '../../../runtime/runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import {
  MAXIMUM_WEBGL_INSTANCE_COUNT,
  validateWebGLInstanceCount,
} from '../../../runtime/webgl-vegetation-resource-management/WebGLResourceLimits.js';
import { hashVegetationCell, mixVegetationHash } from '../deterministic-vegetation-identity/VegetationIds.js';
import type { ParsedVegFile, ParsedVegLayer } from '../../../runtime/vegfile-v2-parsing/ParsedVegetationFile.js';
import type {
  ModelPosition,
  VegetationActiveCellData,
  VegetationRenderTileDensityLayerConfig,
} from './DensitySelectionTypes.js';
import { RENDER_TILE_RECORD_UINT32_COUNT } from './DensitySelectionTypes.js';

const STORED_CHUNK_INDEX_RECORD_OFFSET = 0;
const ACTIVE_CELL_LIST_OFFSET_RECORD_OFFSET = 1;
const PACKED_CELL_AND_ANCHOR_COUNTS_RECORD_OFFSET = 2;
const ACTIVE_ELEMENT_COUNT_RECORD_OFFSET = 3;
const MAXIMUM_PACKED_COUNT = 0xffff;
const MAXIMUM_BUCKET_COUNT = 0x100;

/** Builds exact tile budgets and groups them into GPU capacity buckets. */
export class VegetationRenderTileDensity {
  readonly renderTileSizeCells: number;
  readonly tilesPerChunkAxis: number;
  readonly tileCapacity: number;
  readonly maximumCandidatesPerTile: number;
  readonly activeCellIndices: Uint32Array;
  readonly renderTileRecords: Uint32Array;
  readonly bucketCapacities: Uint32Array;
  readonly bucketTileCounts: Uint32Array;
  readonly bucketRecordOffsets: Uint32Array;
  visibleTileCount = 0;
  visibleCandidateCount = 0;
  frustumTestedTileCount = 0;
  frustumCulledTileCount = 0;

  readonly #dataset: VegetationRuntimeDataset;
  readonly #layer: VegetationRuntimeLayer;
  readonly #densityConfig: VegetationRenderTileDensityLayerConfig;
  readonly #storedChunkGridCoordinates: Uint32Array;
  readonly #activeCellOffsets: Uint32Array;
  readonly #activeCellCounts: Uint32Array;
  readonly #pendingRenderTileRecords: Uint32Array;
  readonly #pendingBucketIndices: Uint8Array;
  readonly #bucketWriteOffsets: Uint32Array;
  readonly #usesPowerOfTwoBuckets: boolean;
  readonly #tileFrustum = new FrustumPlanes();

  constructor(
    dataset: VegetationRuntimeDataset,
    layerId: number,
    preparedCells?: VegetationActiveCellData,
    /** Internal comparison seam; normal runtime construction uses power-of-two buckets. */
    candidateBucketCapacities?: Uint32Array,
  ) {
    const layer = dataset.preparedLayers.find((candidate) => candidate.layerId === layerId);
    if (!layer) throw new Error(`Prepared runtime vegetation layer ${layerId} does not exist.`);
    const densityConfig = requireRenderTileDensityLayerConfig(layer.config);

    this.#dataset = dataset;
    this.#layer = layer;
    this.#densityConfig = densityConfig;
    this.renderTileSizeCells = Math.min(
      densityConfig.density.renderTileSizeCells,
      layer.fileLayer.maskResolution,
    );
    this.tilesPerChunkAxis = Math.ceil(
      layer.fileLayer.maskResolution / this.renderTileSizeCells,
    );
    const tilesPerChunk = this.tilesPerChunkAxis ** 2;
    this.tileCapacity = dataset.file.header.storedChunkCount * tilesPerChunk;
    this.#storedChunkGridCoordinates = dataset.storedChunkGridCoordinates;

    const maximumCellsPerTile = this.renderTileSizeCells ** 2;
    const maximumAnchorsPerTile = maximumCellsPerTile
      * densityConfig.distribution.anchorsPerCell;
    this.maximumCandidatesPerTile = maximumAnchorsPerTile
      * densityConfig.distribution.elementsPerAnchor;
    if (maximumCellsPerTile > MAXIMUM_PACKED_COUNT
      || maximumAnchorsPerTile > MAXIMUM_PACKED_COUNT) {
      throw new Error('Render-tile Cell and Anchor budgets must fit packed 16-bit counts.');
    }
    validateWebGLInstanceCount(this.maximumCandidatesPerTile, 'Render-tile Element budget');

    const activeCells = preparedCells
      ?? createVegetationActiveCellData(dataset, layerId);
    if (activeCells.layerId !== layerId
      || activeCells.renderTileSizeCells !== this.renderTileSizeCells
      || activeCells.counts.length !== this.tileCapacity
      || activeCells.offsets.length !== this.tileCapacity) {
      throw new Error('Prepared active Cells do not match the runtime layer and tile layout.');
    }
    this.activeCellIndices = activeCells.indices;
    this.#activeCellOffsets = activeCells.offsets;
    this.#activeCellCounts = activeCells.counts;

    this.#usesPowerOfTwoBuckets = candidateBucketCapacities === undefined;
    this.bucketCapacities = candidateBucketCapacities
      ? validateAndCopyCandidateBucketCapacities(
        candidateBucketCapacities,
        this.maximumCandidatesPerTile,
      )
      : createPowerOfTwoCandidateBucketCapacities(this.maximumCandidatesPerTile);
    const bucketCount = this.bucketCapacities.length;
    this.bucketTileCounts = new Uint32Array(bucketCount);
    this.bucketRecordOffsets = new Uint32Array(bucketCount);
    this.#bucketWriteOffsets = new Uint32Array(bucketCount);
    this.renderTileRecords = new Uint32Array(
      this.tileCapacity * RENDER_TILE_RECORD_UINT32_COUNT,
    );
    this.#pendingRenderTileRecords = new Uint32Array(
      this.tileCapacity * RENDER_TILE_RECORD_UINT32_COUNT,
    );
    this.#pendingBucketIndices = new Uint8Array(this.tileCapacity);
  }

  /** Rebuilds visible tile budgets without allocating or iterating individual Cells. */
  update(
    visibleStoredChunkIndices: Uint32Array,
    visibleStoredChunkCount: number,
    cameraPositionModel: ModelPosition,
    clipFromModelMatrix?: Matrix4Elements,
    depthRange: ClipSpaceDepthRange = 'negative-one-to-one',
  ): void {
    validateUpdateInput(
      visibleStoredChunkIndices,
      visibleStoredChunkCount,
      this.#dataset.file.header.storedChunkCount,
      cameraPositionModel,
    );
    this.bucketTileCounts.fill(0);
    this.visibleCandidateCount = 0;
    this.frustumTestedTileCount = 0;
    this.frustumCulledTileCount = 0;
    if (clipFromModelMatrix) this.#tileFrustum.update(clipFromModelMatrix, depthRange);
    let pendingTileCount = 0;

    const tilesPerChunk = this.tilesPerChunkAxis ** 2;
    const density = this.#densityConfig.density;
    const maximumDistance = this.#densityConfig.visibility.maximumDistanceMeters;
    const anchorsPerCell = this.#densityConfig.distribution.anchorsPerCell;
    const elementsPerAnchor = this.#densityConfig.distribution.elementsPerAnchor;
    for (
      let visibleStoredChunkListIndex = 0;
      visibleStoredChunkListIndex < visibleStoredChunkCount;
      visibleStoredChunkListIndex += 1
    ) {
      const storedChunkIndex = visibleStoredChunkIndices[visibleStoredChunkListIndex]!;
      for (let tileY = 0; tileY < this.tilesPerChunkAxis; tileY += 1) {
        for (let tileX = 0; tileX < this.tilesPerChunkAxis; tileX += 1) {
          const tileIndex = storedChunkIndex * tilesPerChunk
            + tileY * this.tilesPerChunkAxis
            + tileX;
          const availableCellCount = this.#activeCellCounts[tileIndex]!;
          if (availableCellCount === 0) continue;
          this.frustumTestedTileCount += 1;
          if (clipFromModelMatrix && !isRenderTileInFrustum(
            this.#tileFrustum,
            this.#dataset,
            this.#layer,
            storedChunkIndex,
            tileX,
            tileY,
            this.renderTileSizeCells,
            this.#storedChunkGridCoordinates,
          )) {
            this.frustumCulledTileCount += 1;
            continue;
          }

          const distanceMeters = minimumDistanceToTileMeters(
            this.#dataset,
            this.#layer,
            storedChunkIndex,
            tileX,
            tileY,
            this.renderTileSizeCells,
            cameraPositionModel,
            this.#storedChunkGridCoordinates,
          );
          if (distanceMeters >= maximumDistance) continue;

          const activeCellCount = Math.round(
            availableCellCount
              * evaluateVegetationDensityCurve(density.activeCells, distanceMeters),
          );
          if (activeCellCount === 0) continue;
          const activeAnchorCount = Math.round(
            activeCellCount * anchorsPerCell
              * evaluateVegetationDensityCurve(density.activeAnchors, distanceMeters),
          );
          if (activeAnchorCount === 0) continue;
          const activeElementCount = Math.round(
            activeAnchorCount * elementsPerAnchor
              * evaluateVegetationDensityCurve(density.activeElements, distanceMeters),
          );
          if (activeElementCount === 0) continue;

          const bucketIndex = this.#usesPowerOfTwoBuckets
            ? smallestPowerOfTwoBucketIndex(activeElementCount)
            : findCandidateCapacityBucketIndex(
              this.bucketCapacities,
              activeElementCount,
            );
          const recordOffset = pendingTileCount * RENDER_TILE_RECORD_UINT32_COUNT;
          this.#pendingRenderTileRecords[
            recordOffset + STORED_CHUNK_INDEX_RECORD_OFFSET
          ] = storedChunkIndex;
          this.#pendingRenderTileRecords[
            recordOffset + ACTIVE_CELL_LIST_OFFSET_RECORD_OFFSET
          ] = this.#activeCellOffsets[tileIndex]!;
          this.#pendingRenderTileRecords[
            recordOffset + PACKED_CELL_AND_ANCHOR_COUNTS_RECORD_OFFSET
          ] = packCellAndAnchorCounts(
            activeCellCount,
            activeAnchorCount,
          );
          this.#pendingRenderTileRecords[
            recordOffset + ACTIVE_ELEMENT_COUNT_RECORD_OFFSET
          ] = activeElementCount;
          this.#pendingBucketIndices[pendingTileCount] = bucketIndex;
          this.bucketTileCounts[bucketIndex] = this.bucketTileCounts[bucketIndex]! + 1;
          this.visibleCandidateCount += activeElementCount;
          pendingTileCount += 1;
        }
      }
    }

    let nextRecordOffset = 0;
    for (let bucketIndex = 0; bucketIndex < this.bucketCapacities.length; bucketIndex += 1) {
      this.bucketRecordOffsets[bucketIndex] = nextRecordOffset;
      this.#bucketWriteOffsets[bucketIndex] = nextRecordOffset;
      nextRecordOffset += this.bucketTileCounts[bucketIndex]!;
    }
    for (let pendingIndex = 0; pendingIndex < pendingTileCount; pendingIndex += 1) {
      const bucketIndex = this.#pendingBucketIndices[pendingIndex]!;
      const targetRecordIndex = this.#bucketWriteOffsets[bucketIndex]!;
      this.#bucketWriteOffsets[bucketIndex] = targetRecordIndex + 1;
      const sourceOffset = pendingIndex * RENDER_TILE_RECORD_UINT32_COUNT;
      const targetOffset = targetRecordIndex * RENDER_TILE_RECORD_UINT32_COUNT;
      this.renderTileRecords.set(
        this.#pendingRenderTileRecords.subarray(
          sourceOffset,
          sourceOffset + RENDER_TILE_RECORD_UINT32_COUNT,
        ),
        targetOffset,
      );
    }
    this.visibleTileCount = pendingTileCount;
  }
}

/** Builds static admission once; may run in a worker before WebGL initialization. */
export function createVegetationActiveCellData(
  dataset: VegetationRuntimeDataset,
  layerId: number,
): VegetationActiveCellData {
  const layer = dataset.preparedLayers.find((candidate) => candidate.layerId === layerId);
  if (!layer) throw new Error(`Prepared runtime vegetation layer ${layerId} does not exist.`);
  const config = requireRenderTileDensityLayerConfig(layer.config);
  return createVegetationActiveCellDataForLayer(
    dataset.file,
    layer.fileLayer,
    dataset.storedChunkGridCoordinates,
    layerId,
    config.density.renderTileSizeCells,
  );
}

function requireRenderTileDensityLayerConfig(
  config: VegetationRuntimeLayerConfig,
): VegetationRuntimeLayerConfig & VegetationRenderTileDensityLayerConfig {
  const candidate = config as VegetationRuntimeLayerConfig
    & Partial<VegetationRenderTileDensityLayerConfig>;
  if (!candidate.density || !candidate.distribution || !candidate.visibility) {
    throw new Error(
      `Runtime layer "${config.key}" does not provide render-tile density configuration.`,
    );
  }
  return candidate as VegetationRuntimeLayerConfig & VegetationRenderTileDensityLayerConfig;
}

export function createVegetationActiveCellDataForLayer(
  file: ParsedVegFile,
  fileLayer: ParsedVegLayer,
  storedChunkGridCoordinates: Uint32Array,
  layerId: number,
  configuredTileSizeCells: number,
): VegetationActiveCellData {
  const tileSizeCells = Math.min(configuredTileSizeCells, fileLayer.maskResolution);
  const tilesPerChunkAxis = Math.ceil(fileLayer.maskResolution / tileSizeCells);
  const storedChunkCount = file.header.storedChunkCount;
  const tilesPerChunk = tilesPerChunkAxis ** 2;
  const tileCapacity = storedChunkCount * tilesPerChunk;
  const counts = new Uint32Array(tileCapacity);
  const { maskResolution, maskWordsPerChunk } = fileLayer;
  const activeMaskData = fileLayer.maskData;

  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCount; storedChunkIndex += 1) {
    const chunkMaskOffset = storedChunkIndex * maskWordsPerChunk;
    for (let cellY = 0; cellY < maskResolution; cellY += 1) {
      for (let cellX = 0; cellX < maskResolution; cellX += 1) {
        if (!isMaskCellActive(
          activeMaskData,
          chunkMaskOffset,
          maskResolution,
          cellX,
          cellY,
        )) continue;
        const tileX = Math.floor(cellX / tileSizeCells);
        const tileY = Math.floor(cellY / tileSizeCells);
        const tileIndex = storedChunkIndex * tilesPerChunk
          + tileY * tilesPerChunkAxis
          + tileX;
        counts[tileIndex] = counts[tileIndex]! + 1;
      }
    }
  }

  const offsets = new Uint32Array(tileCapacity);
  let activeCellCount = 0;
  for (let tileIndex = 0; tileIndex < tileCapacity; tileIndex += 1) {
    offsets[tileIndex] = activeCellCount;
    activeCellCount += counts[tileIndex]!;
  }
  const indices = new Uint32Array(activeCellCount);
  const writeOffsets = offsets.slice();
  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCount; storedChunkIndex += 1) {
    const chunkCoordinateOffset = storedChunkIndex * 2;
    const chunkGridX = storedChunkGridCoordinates[chunkCoordinateOffset]!;
    const chunkGridY = storedChunkGridCoordinates[chunkCoordinateOffset + 1]!;
    const chunkMaskOffset = storedChunkIndex * maskWordsPerChunk;
    for (let tileY = 0; tileY < tilesPerChunkAxis; tileY += 1) {
      for (let tileX = 0; tileX < tilesPerChunkAxis; tileX += 1) {
        const tileIndex = storedChunkIndex * tilesPerChunk
          + tileY * tilesPerChunkAxis
          + tileX;
        if (counts[tileIndex] === 0) continue;
        const globalTileCellX = chunkGridX * maskResolution + tileX * tileSizeCells;
        const globalTileCellY = chunkGridY * maskResolution + tileY * tileSizeCells;
        let randomState = hashVegetationCell(file.header.seed, {
          layerId,
          globalCellX: globalTileCellX,
          globalCellY: globalTileCellY,
        });
        for (let selectedCellIndex = 0;
          selectedCellIndex < tileSizeCells ** 2;
          selectedCellIndex += 1) {
          const cellX = tileX * tileSizeCells + selectedCellIndex % tileSizeCells;
          const cellY = tileY * tileSizeCells + Math.floor(selectedCellIndex / tileSizeCells);
          if (cellX >= maskResolution || cellY >= maskResolution) continue;
          if (!isMaskCellActive(
            activeMaskData,
            chunkMaskOffset,
            maskResolution,
            cellX,
            cellY,
          )) continue;
          indices[writeOffsets[tileIndex]!] = cellY * maskResolution + cellX;
          writeOffsets[tileIndex] = writeOffsets[tileIndex]! + 1;
        }
        // Fisher-Yates once during preparation; runtime coverage uses a stable prefix.
        const offset = offsets[tileIndex]!;
        for (let remaining = counts[tileIndex]!; remaining > 1; remaining -= 1) {
          randomState = (randomState + 0x6d2b_79f5) >>> 0;
          const selected = Math.floor(mixVegetationHash(randomState) / 0x1_0000_0000 * remaining);
          const lastIndex = offset + remaining - 1;
          const selectedIndex = offset + selected;
          const value = indices[lastIndex]!;
          indices[lastIndex] = indices[selectedIndex]!;
          indices[selectedIndex] = value;
        }
      }
    }
  }
  return { layerId, renderTileSizeCells: tileSizeCells, indices, offsets, counts };
}

function isMaskCellActive(
  maskData: Uint32Array,
  chunkMaskOffset: number,
  maskResolution: number,
  cellX: number,
  cellY: number,
): boolean {
  const cellIndex = cellY * maskResolution + cellX;
  const word = maskData[chunkMaskOffset + Math.floor(cellIndex / 32)]!;
  return ((word >>> (cellIndex % 32)) & 1) === 1;
}

function packCellAndAnchorCounts(cellCount: number, anchorCount: number): number {
  return (cellCount | (anchorCount << 16)) >>> 0;
}

function smallestPowerOfTwoBucketIndex(candidateCount: number): number {
  if (candidateCount <= 1) return 0;
  return 32 - Math.clz32(candidateCount - 1);
}

function createPowerOfTwoCandidateBucketCapacities(
  maximumCandidateCount: number,
): Uint32Array {
  const bucketCount = smallestPowerOfTwoBucketIndex(maximumCandidateCount) + 1;
  return Uint32Array.from(
    { length: bucketCount },
    (_, bucketIndex) => Math.min(2 ** bucketIndex, MAXIMUM_WEBGL_INSTANCE_COUNT),
  );
}

function validateAndCopyCandidateBucketCapacities(
  capacities: Uint32Array,
  maximumCandidateCount: number,
): Uint32Array {
  if (capacities.length === 0 || capacities.length > MAXIMUM_BUCKET_COUNT) {
    throw new Error(
      `Candidate capacity buckets must contain between 1 and ${MAXIMUM_BUCKET_COUNT} entries.`,
    );
  }
  let previousCapacity = 0;
  for (const capacity of capacities) {
    if (capacity <= previousCapacity || capacity > MAXIMUM_WEBGL_INSTANCE_COUNT) {
      throw new Error(
        'Candidate capacity buckets must be strictly increasing positive WebGL instance counts.',
      );
    }
    previousCapacity = capacity;
  }
  if (previousCapacity < maximumCandidateCount) {
    throw new Error(
      `Final candidate capacity bucket ${previousCapacity} does not cover maximum Tile budget ${maximumCandidateCount}.`,
    );
  }
  return capacities.slice();
}

function findCandidateCapacityBucketIndex(
  capacities: Uint32Array,
  candidateCount: number,
): number {
  let minimumIndex = 0;
  let maximumIndex = capacities.length - 1;
  while (minimumIndex < maximumIndex) {
    const middleIndex = Math.floor((minimumIndex + maximumIndex) / 2);
    if (capacities[middleIndex]! < candidateCount) minimumIndex = middleIndex + 1;
    else maximumIndex = middleIndex;
  }
  return minimumIndex;
}

function minimumDistanceToTileMeters(
  dataset: VegetationRuntimeDataset,
  layer: VegetationRuntimeLayer,
  storedChunkIndex: number,
  tileX: number,
  tileY: number,
  tileSizeCells: number,
  camera: ModelPosition,
  storedChunkGridCoordinates: Uint32Array,
): number {
  const { header, chunkHeightRanges } = dataset.file;
  const chunkCoordinateOffset = storedChunkIndex * 2;
  const chunkGridX = storedChunkGridCoordinates[chunkCoordinateOffset]!;
  const chunkGridY = storedChunkGridCoordinates[chunkCoordinateOffset + 1]!;
  const tileSizeUnits = tileSizeCells * layer.cellSizeModelUnits;
  const minimumHorizontalA = header.grid.originX
    + chunkGridX * header.grid.chunkSize
    + tileX * tileSizeUnits;
  const minimumHorizontalB = header.grid.originY
    + chunkGridY * header.grid.chunkSize
    + tileY * tileSizeUnits;
  const maximumHorizontalA = Math.min(
    minimumHorizontalA + tileSizeUnits,
    header.grid.originX + (chunkGridX + 1) * header.grid.chunkSize,
  );
  const maximumHorizontalB = Math.min(
    minimumHorizontalB + tileSizeUnits,
    header.grid.originY + (chunkGridY + 1) * header.grid.chunkSize,
  );
  const heightOffset = storedChunkIndex * 2;
  const coordinates = [camera.x, camera.y, camera.z];
  const horizontalAxisA = axisIndex(header.coordinateSystem.horizontalAxes[0]);
  const horizontalAxisB = axisIndex(header.coordinateSystem.horizontalAxes[1]);
  const upAxis = axisIndex(header.coordinateSystem.upAxis);
  const deltaA = distanceOutsideInterval(
    coordinates[horizontalAxisA]!, minimumHorizontalA, maximumHorizontalA,
  );
  const deltaB = distanceOutsideInterval(
    coordinates[horizontalAxisB]!, minimumHorizontalB, maximumHorizontalB,
  );
  const deltaUp = distanceOutsideInterval(
    coordinates[upAxis]!, chunkHeightRanges[heightOffset]!, chunkHeightRanges[heightOffset + 1]!,
  );
  return Math.hypot(deltaA, deltaB, deltaUp) / header.coordinateSystem.unitsPerMeter;
}

function isRenderTileInFrustum(
  frustum: FrustumPlanes,
  dataset: VegetationRuntimeDataset,
  layer: VegetationRuntimeLayer,
  storedChunkIndex: number,
  tileX: number,
  tileY: number,
  tileSizeCells: number,
  storedChunkGridCoordinates: Uint32Array,
): boolean {
  const { header, chunkHeightRanges } = dataset.file;
  const chunkCoordinateOffset = storedChunkIndex * 2;
  const chunkGridX = storedChunkGridCoordinates[chunkCoordinateOffset]!;
  const chunkGridY = storedChunkGridCoordinates[chunkCoordinateOffset + 1]!;
  const tileSizeUnits = tileSizeCells * layer.cellSizeModelUnits;
  const horizontalPaddingUnits = layer.cullingBounds.horizontalPaddingMeters
    * header.coordinateSystem.unitsPerMeter;
  const minimumHorizontalA = header.grid.originX
    + chunkGridX * header.grid.chunkSize
    + tileX * tileSizeUnits
    - horizontalPaddingUnits;
  const minimumHorizontalB = header.grid.originY
    + chunkGridY * header.grid.chunkSize
    + tileY * tileSizeUnits
    - horizontalPaddingUnits;
  const maximumHorizontalA = Math.min(
    minimumHorizontalA + tileSizeUnits + horizontalPaddingUnits * 2,
    header.grid.originX + (chunkGridX + 1) * header.grid.chunkSize + horizontalPaddingUnits,
  );
  const maximumHorizontalB = Math.min(
    minimumHorizontalB + tileSizeUnits + horizontalPaddingUnits * 2,
    header.grid.originY + (chunkGridY + 1) * header.grid.chunkSize + horizontalPaddingUnits,
  );
  const heightOffset = storedChunkIndex * 2;
  const minimumUp = chunkHeightRanges[heightOffset]!
    - layer.cullingBounds.belowSurfaceMeters * header.coordinateSystem.unitsPerMeter;
  const maximumUp = chunkHeightRanges[heightOffset + 1]!
    + layer.cullingBounds.aboveSurfaceMeters * header.coordinateSystem.unitsPerMeter;
  const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
  const minimumX = horizontalAxisA === 'x' ? minimumHorizontalA
    : horizontalAxisB === 'x' ? minimumHorizontalB : minimumUp;
  const minimumY = horizontalAxisA === 'y' ? minimumHorizontalA
    : horizontalAxisB === 'y' ? minimumHorizontalB : minimumUp;
  const minimumZ = horizontalAxisA === 'z' ? minimumHorizontalA
    : horizontalAxisB === 'z' ? minimumHorizontalB : minimumUp;
  const maximumX = horizontalAxisA === 'x' ? maximumHorizontalA
    : horizontalAxisB === 'x' ? maximumHorizontalB : maximumUp;
  const maximumY = horizontalAxisA === 'y' ? maximumHorizontalA
    : horizontalAxisB === 'y' ? maximumHorizontalB : maximumUp;
  const maximumZ = horizontalAxisA === 'z' ? maximumHorizontalA
    : horizontalAxisB === 'z' ? maximumHorizontalB : maximumUp;
  return frustum.intersects(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ);
}

function axisIndex(axis: Axis): number {
  if (axis === 'x') return 0;
  if (axis === 'y') return 1;
  return 2;
}

function distanceOutsideInterval(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum - value;
  if (value > maximum) return value - maximum;
  return 0;
}

function validateUpdateInput(
  visibleStoredChunkIndices: Uint32Array,
  visibleStoredChunkCount: number,
  storedChunkCount: number,
  camera: ModelPosition,
): void {
  if (!Number.isInteger(visibleStoredChunkCount)
    || visibleStoredChunkCount < 0
    || visibleStoredChunkCount > visibleStoredChunkIndices.length) {
    throw new Error(
      'visibleStoredChunkCount must fit the visible stored chunk index array.',
    );
  }
  for (let index = 0; index < visibleStoredChunkCount; index += 1) {
    if (visibleStoredChunkIndices[index]! >= storedChunkCount) {
      throw new Error(
        `Visible stored chunk index ${visibleStoredChunkIndices[index]} is out of range.`,
      );
    }
  }
  if (![camera.x, camera.y, camera.z].every(Number.isFinite)) {
    throw new Error('cameraPositionModel must contain only finite values.');
  }
}
