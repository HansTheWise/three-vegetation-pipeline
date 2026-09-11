import type { Axis } from '../../offline/config/types.js';
import { FrustumPlanes } from '../chunking/FrustumPlanes.js';
import type { ClipSpaceDepthRange, Matrix4Elements } from '../chunking/types.js';
import { evaluateVegetationDensityCurve } from '../config/evaluateVegetationDensityCurve.js';
import type { GrassRuntimeLayerConfig } from '../config/types.js';
import type { VegetationRuntimeDataset, VegetationRuntimeLayer } from '../dataset/types.js';
import {
  MAXIMUM_WEBGL_INSTANCE_COUNT,
  validateWebGLInstanceCount,
} from '../gpu/webgl/limits.js';
import { createStoredChunkGridCoordinates } from '../gpu/StoredChunkGridCoordinates.js';
import { hashVegetationCell, mixVegetationHash } from '../identity/VegetationIds.js';
import type { ParsedVegFile, ParsedVegLayer } from '../parser/types.js';
import { requireGrassRuntimeLayerConfig } from '../profiles/grass/GrassRenderProfile.js';
import type { ModelPosition, VegetationActiveCellData } from './types.js';

const VALUES_PER_TILE_RECORD = 4;
const MAXIMUM_PACKED_COUNT = 0xffff;

/** Builds exact tile budgets and groups them into GPU capacity buckets. */
export class VegetationRenderTileDensity {
  readonly renderTileSizeCells: number;
  readonly tilesPerChunkAxis: number;
  readonly tileCapacity: number;
  readonly maximumCandidatesPerTile: number;
  readonly activeCellIndices: Uint32Array;
  readonly tileRecords: Uint32Array;
  readonly bucketCapacities: Uint32Array;
  readonly bucketTileCounts: Uint32Array;
  readonly bucketRecordOffsets: Uint32Array;
  visibleTileCount = 0;
  visibleCandidateCount = 0;
  frustumTestedTileCount = 0;
  frustumCulledTileCount = 0;

  readonly #dataset: VegetationRuntimeDataset;
  readonly #layer: VegetationRuntimeLayer<GrassRuntimeLayerConfig>;
  readonly #storedChunkGridCoordinates: Uint32Array;
  readonly #activeCellOffsets: Uint32Array;
  readonly #activeCellCounts: Uint32Array;
  readonly #pendingTileRecords: Uint32Array;
  readonly #pendingBucketIndices: Uint8Array;
  readonly #bucketWriteOffsets: Uint32Array;
  readonly #tileFrustum = new FrustumPlanes();

  constructor(
    dataset: VegetationRuntimeDataset,
    layerId: number,
    preparedCells?: VegetationActiveCellData,
  ) {
    const layer = dataset.enabledLayers.find((candidate) => candidate.layerId === layerId);
    if (!layer) throw new Error(`Enabled runtime vegetation layer ${layerId} does not exist.`);
    const grassLayer = layer as VegetationRuntimeLayer<GrassRuntimeLayerConfig>;
    requireGrassRuntimeLayerConfig(grassLayer.config);

    this.#dataset = dataset;
    this.#layer = grassLayer;
    this.renderTileSizeCells = Math.min(
      grassLayer.config.density.renderTileSizeCells,
      layer.fileLayer.maskResolution,
    );
    this.tilesPerChunkAxis = Math.ceil(
      layer.fileLayer.maskResolution / this.renderTileSizeCells,
    );
    const tilesPerChunk = this.tilesPerChunkAxis ** 2;
    this.tileCapacity = dataset.file.header.storedChunkCount * tilesPerChunk;
    this.#storedChunkGridCoordinates = createStoredChunkGridCoordinates(dataset.file);

    const maximumCellsPerTile = this.renderTileSizeCells ** 2;
    const maximumAnchorsPerTile = maximumCellsPerTile
      * grassLayer.config.distribution.anchorsPerCell;
    this.maximumCandidatesPerTile = maximumAnchorsPerTile
      * grassLayer.config.distribution.elementsPerAnchor;
    if (maximumCellsPerTile > MAXIMUM_PACKED_COUNT
      || maximumAnchorsPerTile > MAXIMUM_PACKED_COUNT) {
      throw new Error('Render-tile Cell and Anchor budgets must fit packed 16-bit counts.');
    }
    validateWebGLInstanceCount(this.maximumCandidatesPerTile, 'Render-tile Element budget');

    const activeCells = preparedCells ?? createVegetationActiveCellData(dataset, layerId);
    if (activeCells.layerId !== layerId
      || activeCells.renderTileSizeCells !== this.renderTileSizeCells
      || activeCells.counts.length !== this.tileCapacity
      || activeCells.offsets.length !== this.tileCapacity) {
      throw new Error('Prepared active Cells do not match the runtime layer and tile layout.');
    }
    this.activeCellIndices = activeCells.indices;
    this.#activeCellOffsets = activeCells.offsets;
    this.#activeCellCounts = activeCells.counts;

    const bucketCount = smallestPowerOfTwoBucketIndex(this.maximumCandidatesPerTile) + 1;
    this.bucketCapacities = Uint32Array.from(
      { length: bucketCount },
      (_, bucketIndex) => Math.min(2 ** bucketIndex, MAXIMUM_WEBGL_INSTANCE_COUNT),
    );
    this.bucketTileCounts = new Uint32Array(bucketCount);
    this.bucketRecordOffsets = new Uint32Array(bucketCount);
    this.#bucketWriteOffsets = new Uint32Array(bucketCount);
    this.tileRecords = new Uint32Array(this.tileCapacity * VALUES_PER_TILE_RECORD);
    this.#pendingTileRecords = new Uint32Array(this.tileCapacity * VALUES_PER_TILE_RECORD);
    this.#pendingBucketIndices = new Uint8Array(this.tileCapacity);
  }

  /** Rebuilds visible tile budgets without allocating or iterating individual Cells. */
  update(
    visibleChunkIndices: Uint32Array,
    visibleChunkCount: number,
    cameraPositionModel: ModelPosition,
    clipFromModelMatrix?: Matrix4Elements,
    depthRange: ClipSpaceDepthRange = 'negative-one-to-one',
  ): void {
    validateUpdateInput(
      visibleChunkIndices,
      visibleChunkCount,
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
    const density = this.#layer.config.density;
    const maximumDistance = this.#layer.config.visibility.maximumDistanceMeters;
    const anchorsPerCell = this.#layer.config.distribution.anchorsPerCell;
    const elementsPerAnchor = this.#layer.config.distribution.elementsPerAnchor;
    for (let visibleIndex = 0; visibleIndex < visibleChunkCount; visibleIndex += 1) {
      const storedChunkIndex = visibleChunkIndices[visibleIndex]!;
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

          const bucketIndex = smallestPowerOfTwoBucketIndex(activeElementCount);
          const recordOffset = pendingTileCount * VALUES_PER_TILE_RECORD;
          this.#pendingTileRecords[recordOffset] = storedChunkIndex;
          this.#pendingTileRecords[recordOffset + 1] = this.#activeCellOffsets[tileIndex]!;
          this.#pendingTileRecords[recordOffset + 2] = packCellAndAnchorCounts(
            activeCellCount,
            activeAnchorCount,
          );
          this.#pendingTileRecords[recordOffset + 3] = activeElementCount;
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
      const sourceOffset = pendingIndex * VALUES_PER_TILE_RECORD;
      const targetOffset = targetRecordIndex * VALUES_PER_TILE_RECORD;
      this.tileRecords.set(
        this.#pendingTileRecords.subarray(sourceOffset, sourceOffset + VALUES_PER_TILE_RECORD),
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
  const layer = dataset.enabledLayers.find((candidate) => candidate.layerId === layerId);
  if (!layer) throw new Error(`Enabled runtime vegetation layer ${layerId} does not exist.`);
  const config = requireGrassRuntimeLayerConfig(layer.config);
  return createVegetationActiveCellDataForLayer(
    dataset.file,
    layer.fileLayer,
    layerId,
    config.density.renderTileSizeCells,
  );
}

export function createVegetationActiveCellDataForLayer(
  file: ParsedVegFile,
  fileLayer: ParsedVegLayer,
  layerId: number,
  configuredTileSizeCells: number,
): VegetationActiveCellData {
  const tileSizeCells = Math.min(configuredTileSizeCells, fileLayer.maskResolution);
  const tilesPerChunkAxis = Math.ceil(fileLayer.maskResolution / tileSizeCells);
  const storedChunkGridCoordinates = createStoredChunkGridCoordinates(file);
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
  const tileSizeUnits = tileSizeCells * layer.cellSizeUnits;
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
  const tileSizeUnits = tileSizeCells * layer.cellSizeUnits;
  const horizontalPaddingUnits = layer.config.renderBounds.horizontalPaddingMeters
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
    - layer.config.renderBounds.belowSurfaceMeters * header.coordinateSystem.unitsPerMeter;
  const maximumUp = chunkHeightRanges[heightOffset + 1]!
    + layer.config.renderBounds.aboveSurfaceMeters * header.coordinateSystem.unitsPerMeter;
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
  visibleChunkIndices: Uint32Array,
  visibleChunkCount: number,
  storedChunkCount: number,
  camera: ModelPosition,
): void {
  if (!Number.isInteger(visibleChunkCount)
    || visibleChunkCount < 0
    || visibleChunkCount > visibleChunkIndices.length) {
    throw new Error('visibleChunkCount must fit the visible chunk index array.');
  }
  for (let index = 0; index < visibleChunkCount; index += 1) {
    if (visibleChunkIndices[index]! >= storedChunkCount) {
      throw new Error(`Visible stored chunk index ${visibleChunkIndices[index]} is out of range.`);
    }
  }
  if (![camera.x, camera.y, camera.z].every(Number.isFinite)) {
    throw new Error('cameraPositionModel must contain only finite values.');
  }
}
