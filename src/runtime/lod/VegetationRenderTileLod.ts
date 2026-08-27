import type { Axis } from '../../offline/config/types.js';
import type { VegetationRuntimeDataset, VegetationRuntimeLayer } from '../dataset/types.js';
import { createStoredChunkGridCoordinates } from '../gpu/StoredChunkGridCoordinates.js';
import { hashVegetationCell, mixVegetationHash } from '../identity/VegetationIds.js';
import type { ModelPosition, VegetationLodLevel } from './types.js';

const VALUES_PER_TILE_RECORD = 3;
export const LOD_CELL_COLUMN_HASH_SALT = 0x68bc_21eb;

/** Creates and reuses distance-LOD work lists for the active tiles of one layer. */
export class VegetationRenderTileLod {
  readonly levels: readonly VegetationLodLevel[];
  readonly tileCounts: Uint32Array;
  readonly fadeStartsMeters: Float32Array;
  readonly fadeEndsMeters: Float32Array;
  readonly renderTileSizeCells: number;
  readonly tilesPerChunkAxis: number;
  readonly tileCapacity: number;

  readonly #dataset: VegetationRuntimeDataset;
  readonly #layer: VegetationRuntimeLayer;
  readonly #storedChunkGridCoordinates: Uint32Array;
  readonly #activeTiles: Uint8Array;

  constructor(dataset: VegetationRuntimeDataset, layerId: number) {
    const layer = dataset.enabledLayers.find((candidate) => candidate.layerId === layerId);
    if (!layer) throw new Error(`Enabled runtime vegetation layer ${layerId} does not exist.`);

    this.#dataset = dataset;
    this.#layer = layer;
    this.renderTileSizeCells = Math.min(
      layer.config.lod.renderTileSizeCells,
      layer.fileLayer.maskResolution,
    );
    this.tilesPerChunkAxis = Math.ceil(
      layer.fileLayer.maskResolution / this.renderTileSizeCells,
    );
    const tilesPerChunk = this.tilesPerChunkAxis ** 2;
    this.tileCapacity = dataset.file.header.storedChunkCount * tilesPerChunk;
    this.#storedChunkGridCoordinates = createStoredChunkGridCoordinates(dataset.file);
    this.#activeTiles = createActiveTileFlags(
      layer,
      dataset.file.header.storedChunkCount,
      this.renderTileSizeCells,
      this.tilesPerChunkAxis,
    );

    const cellsPerTile = this.renderTileSizeCells ** 2;
    const maximumCandidateCount = cellsPerTile
      * layer.patterns.anchorsPerPattern
      * layer.config.bladeCount.maximumPerAnchor;
    const levels = layer.config.lod.levels.map((level) => {
      const cellCount = Math.max(
        1,
        Math.ceil(cellsPerTile * level.cellCoverageRatio),
      );
      return {
        cellCount,
        cellCoverageRatio: cellCount / cellsPerTile,
        anchorCount: level.anchorCount,
        elementCount: level.elementCount,
        bladeSegments: level.bladeSegments,
        heightSampling: level.heightSampling,
        distanceDensityRatio: cellCount
          * level.anchorCount
          * level.elementCount
          / maximumCandidateCount,
        tileRecords: new Uint32Array(this.tileCapacity * VALUES_PER_TILE_RECORD),
      };
    });
    this.levels = removeDuplicateLevels(levels);
    this.tileCounts = new Uint32Array(this.levels.length);
    const fades = createFadeDistances(layer, this.levels);
    this.fadeStartsMeters = fades.starts;
    this.fadeEndsMeters = fades.ends;
  }

  /** Rebuilds the fixed LOD work lists without allocating per frame. */
  update(
    visibleChunkIndices: Uint32Array,
    visibleChunkCount: number,
    cameraPositionModel: ModelPosition,
  ): void {
    validateUpdateInput(
      visibleChunkIndices,
      visibleChunkCount,
      this.#dataset.file.header.storedChunkCount,
      cameraPositionModel,
    );
    this.tileCounts.fill(0);

    const tilesPerChunk = this.tilesPerChunkAxis ** 2;
    for (let visibleIndex = 0; visibleIndex < visibleChunkCount; visibleIndex += 1) {
      const storedChunkIndex = visibleChunkIndices[visibleIndex]!;
      for (let tileY = 0; tileY < this.tilesPerChunkAxis; tileY += 1) {
        for (let tileX = 0; tileX < this.tilesPerChunkAxis; tileX += 1) {
          const tileIndex = storedChunkIndex * tilesPerChunk
            + tileY * this.tilesPerChunkAxis
            + tileX;
          if (this.#activeTiles[tileIndex] === 0) continue;

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
          const levelIndex = selectLodLevel(distanceMeters, this.fadeEndsMeters);
          if (levelIndex < 0) continue;

          const tileCount = this.tileCounts[levelIndex]!;
          const recordOffset = tileCount * VALUES_PER_TILE_RECORD;
          const records = this.levels[levelIndex]!.tileRecords;
          records[recordOffset] = storedChunkIndex;
          records[recordOffset + 1] = tileX;
          records[recordOffset + 2] = tileY;
          this.tileCounts[levelIndex] = tileCount + 1;
        }
      }
    }
  }
}

function removeDuplicateLevels(levels: readonly VegetationLodLevel[]): VegetationLodLevel[] {
  return levels.filter((level, index) => index === 0
    || level.cellCount !== levels[index - 1]!.cellCount
    || level.anchorCount !== levels[index - 1]!.anchorCount
    || level.elementCount !== levels[index - 1]!.elementCount
    || level.bladeSegments !== levels[index - 1]!.bladeSegments
    || level.heightSampling !== levels[index - 1]!.heightSampling);
}

function createActiveTileFlags(
  layer: VegetationRuntimeLayer,
  storedChunkCount: number,
  tileSizeCells: number,
  tilesPerChunkAxis: number,
): Uint8Array {
  const tilesPerChunk = tilesPerChunkAxis ** 2;
  const flags = new Uint8Array(storedChunkCount * tilesPerChunk);
  const { maskData, maskResolution, maskWordsPerChunk } = layer.fileLayer;
  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCount; storedChunkIndex += 1) {
    const chunkMaskOffset = storedChunkIndex * maskWordsPerChunk;
    for (let cellY = 0; cellY < maskResolution; cellY += 1) {
      for (let cellX = 0; cellX < maskResolution; cellX += 1) {
        const cellIndex = cellY * maskResolution + cellX;
        const word = maskData[chunkMaskOffset + Math.floor(cellIndex / 32)]!;
        if (((word >>> (cellIndex % 32)) & 1) === 0) continue;
        const tileX = Math.floor(cellX / tileSizeCells);
        const tileY = Math.floor(cellY / tileSizeCells);
        flags[storedChunkIndex * tilesPerChunk + tileY * tilesPerChunkAxis + tileX] = 1;
      }
    }
  }
  return flags;
}

function createFadeDistances(
  layer: VegetationRuntimeLayer,
  levels: readonly VegetationLodLevel[],
): Readonly<{ starts: Float32Array; ends: Float32Array }> {
  const starts = new Float32Array(levels.length);
  const ends = new Float32Array(levels.length);
  const countConfig = layer.config.bladeCount;
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const densityThreshold = (
      levels[levelIndex]!.distanceDensityRatio
      + levels[levelIndex + 1]!.distanceDensityRatio
    ) * 0.5;
    starts[levelIndex] = distanceAtDensity(layer, densityThreshold);
    ends[levelIndex] = Math.min(
      starts[levelIndex]! + countConfig.growthTransitionDistanceMeters,
      countConfig.reachesZeroAtMeters,
    );
  }
  const finalLevel = levels.length - 1;
  ends[finalLevel] = countConfig.reachesZeroAtMeters;
  starts[finalLevel] = Math.max(
    countConfig.startsDecreasingAtMeters,
    ends[finalLevel]! - countConfig.growthTransitionDistanceMeters,
  );
  return { starts, ends };
}

/** Maps a compact LOD prefix index onto one stable, non-repeating Tile Cell. */
export function selectLodTileCell(
  seed: number,
  layerId: number,
  globalTileCellX: number,
  globalTileCellY: number,
  tileSizeCells: number,
  selectedCellIndex: number,
): Readonly<{ x: number; y: number }> {
  if (!Number.isInteger(tileSizeCells) || tileSizeCells < 1) {
    throw new Error('tileSizeCells must be a positive integer.');
  }
  const cellCapacity = tileSizeCells ** 2;
  if (!Number.isInteger(selectedCellIndex)
    || selectedCellIndex < 0
    || selectedCellIndex >= cellCapacity) {
    throw new Error('selectedCellIndex must fit the render tile.');
  }

  const tileHash = hashVegetationCell(seed, {
    layerId,
    globalCellX: globalTileCellX,
    globalCellY: globalTileCellY,
  });
  const stride = createCellPermutationStride(tileSizeCells);
  const column = selectedCellIndex % tileSizeCells;
  const pass = Math.floor(selectedCellIndex / tileSizeCells);
  const x = (
    column * stride + tileHash % tileSizeCells
  ) % tileSizeCells;
  const columnHash = mixVegetationHash(
    tileHash ^ Math.imul(column + 1, LOD_CELL_COLUMN_HASH_SALT),
  );
  const y = (
    columnHash % tileSizeCells
    + pass * stride
    + (tileHash >>> 16) % tileSizeCells
  ) % tileSizeCells;
  return { x, y };
}

export function createCellPermutationStride(tileSizeCells: number): number {
  if (!Number.isInteger(tileSizeCells) || tileSizeCells < 1) {
    throw new Error('tileSizeCells must be a positive integer.');
  }
  let stride = Math.max(1, Math.floor(tileSizeCells * 0.61803398875));
  while (greatestCommonDivisor(stride, tileSizeCells) !== 1) stride -= 1;
  return stride;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function distanceAtDensity(layer: VegetationRuntimeLayer, density: number): number {
  const config = layer.config.bladeCount;
  const exponentialEnd = Math.exp(-config.curveStrength);
  const exponentialValue = density * (1 - exponentialEnd) + exponentialEnd;
  const ratio = -Math.log(exponentialValue) / config.curveStrength;
  return config.startsDecreasingAtMeters
    + ratio * (config.reachesZeroAtMeters - config.startsDecreasingAtMeters);
}

function selectLodLevel(distanceMeters: number, fadeEndsMeters: Float32Array): number {
  for (let levelIndex = 0; levelIndex < fadeEndsMeters.length; levelIndex += 1) {
    if (distanceMeters < fadeEndsMeters[levelIndex]!) return levelIndex;
  }
  return -1;
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
    coordinates[horizontalAxisA]!,
    minimumHorizontalA,
    maximumHorizontalA,
  );
  const deltaB = distanceOutsideInterval(
    coordinates[horizontalAxisB]!,
    minimumHorizontalB,
    maximumHorizontalB,
  );
  const deltaUp = distanceOutsideInterval(
    coordinates[upAxis]!,
    chunkHeightRanges[heightOffset]!,
    chunkHeightRanges[heightOffset + 1]!,
  );
  return Math.hypot(deltaA, deltaB, deltaUp) / header.coordinateSystem.unitsPerMeter;
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
