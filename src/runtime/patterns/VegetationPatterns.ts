import type { VegetationRuntimeLayerConfig } from '../config/types.js';
import {
  CELL_PATTERN_BITS,
  CELL_REFLECTION_BITS,
  CELL_ROTATION_BITS,
} from '../identity/CellHashLayout.js';
import {
  hashVegetationCell,
  mixVegetationHash,
  readVegetationHashBits,
  selectVegetationHashIndex,
} from '../identity/VegetationIds.js';
import type { CellPatternSelection, VegetationPatternSet } from './types.js';

const CANDIDATES_PER_ANCHOR = 24;
const DEFAULT_LOD_LEVEL_COUNT = 3;

/** Creates deterministic, progressively distributed anchor patterns for one layer. */
export function createVegetationPatterns(
  seed: number,
  patternConfig: VegetationRuntimeLayerConfig['pattern'],
  lodAnchorCounts: readonly number[] = Array.from(createLodAnchorCounts(
    patternConfig.anchorsPerCell,
    DEFAULT_LOD_LEVEL_COUNT,
  )),
): VegetationPatternSet {
  validatePatternInput(seed, patternConfig.patternCount, patternConfig.anchorsPerCell);
  validateLodAnchorCounts(lodAnchorCounts, patternConfig.anchorsPerCell);

  const anchorPositions = new Float32Array(
    patternConfig.patternCount * patternConfig.anchorsPerCell * 2,
  );
  for (let patternIndex = 0; patternIndex < patternConfig.patternCount; patternIndex += 1) {
    createPatternAnchors(
      anchorPositions,
      patternIndex,
      patternConfig.anchorsPerCell,
      createRandomNumberGenerator(
        mixVegetationHash(seed ^ Math.imul(patternIndex + 1, 0x9e3779b9)),
      ),
    );
  }

  return {
    patternCount: patternConfig.patternCount,
    anchorsPerPattern: patternConfig.anchorsPerCell,
    anchorPositions,
    lodAnchorCounts: Uint32Array.from(lodAnchorCounts),
  };
}

function validateLodAnchorCounts(
  lodAnchorCounts: readonly number[],
  anchorsPerCell: number,
): void {
  if (lodAnchorCounts.length === 0) {
    throw new Error('lodAnchorCounts must not be empty.');
  }
  let previousCount = anchorsPerCell;
  for (const count of lodAnchorCounts) {
    if (!Number.isInteger(count) || count < 1 || count > previousCount) {
      throw new Error('lodAnchorCounts must contain descending positive Anchor counts.');
    }
    previousCount = count;
  }
}

/** Uses a power-of-two reduction: LOD 0 is full density, later LODs halve it. */
export function createLodAnchorCounts(
  anchorsPerPattern: number,
  lodLevelCount = DEFAULT_LOD_LEVEL_COUNT,
): Uint32Array {
  if (!Number.isInteger(anchorsPerPattern) || anchorsPerPattern < 1) {
    throw new Error('anchorsPerPattern must be a positive integer.');
  }
  if (!Number.isInteger(lodLevelCount) || lodLevelCount < 1) {
    throw new Error('lodLevelCount must be a positive integer.');
  }

  return Uint32Array.from(
    { length: lodLevelCount },
    (_, lodLevel) => Math.max(1, Math.ceil(anchorsPerPattern / (2 ** lodLevel))),
  );
}

/** Deterministically assigns pattern, quarter-turn rotation and reflection to a cell. */
export function selectCellPattern(
  seed: number,
  layerId: number,
  globalCellX: number,
  globalCellY: number,
  patternConfig: VegetationRuntimeLayerConfig['pattern'],
): CellPatternSelection {
  validatePatternInput(seed, patternConfig.patternCount, patternConfig.anchorsPerCell);
  for (const [name, value] of [
    ['layerId', layerId],
    ['globalCellX', globalCellX],
    ['globalCellY', globalCellY],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }

  const selectionHash = hashVegetationCell(seed, {
    layerId,
    globalCellX,
    globalCellY,
  });
  return {
    patternIndex: selectVegetationHashIndex(
      readVegetationHashBits(
        selectionHash,
        CELL_PATTERN_BITS.offset,
        CELL_PATTERN_BITS.length,
      ),
      patternConfig.patternCount,
    ),
    rotationQuarterTurns: patternConfig.rotatePerCell
      ? readVegetationHashBits(
        selectionHash,
        CELL_ROTATION_BITS.offset,
        CELL_ROTATION_BITS.length,
      ) as 0 | 1 | 2 | 3
      : 0,
    reflected: patternConfig.reflectPerCell && readVegetationHashBits(
      selectionHash,
      CELL_REFLECTION_BITS.offset,
      CELL_REFLECTION_BITS.length,
    ) === 1,
  };
}

function createPatternAnchors(
  positions: Float32Array,
  patternIndex: number,
  anchorsPerPattern: number,
  random: () => number,
): void {
  const patternOffset = patternIndex * anchorsPerPattern * 2;
  for (let anchorIndex = 0; anchorIndex < anchorsPerPattern; anchorIndex += 1) {
    let selectedX = random();
    let selectedY = random();
    let selectedDistance = -1;
    const candidateCount = anchorIndex === 0 ? 1 : CANDIDATES_PER_ANCHOR;

    for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
      const candidateX = candidateIndex === 0 ? selectedX : random();
      const candidateY = candidateIndex === 0 ? selectedY : random();
      const distance = minimumSquaredDistance(
        positions,
        patternOffset,
        anchorIndex,
        candidateX,
        candidateY,
      );
      if (distance > selectedDistance) {
        selectedX = candidateX;
        selectedY = candidateY;
        selectedDistance = distance;
      }
    }

    const anchorOffset = patternOffset + anchorIndex * 2;
    positions[anchorOffset] = selectedX;
    positions[anchorOffset + 1] = selectedY;
  }
}

function minimumSquaredDistance(
  positions: Float32Array,
  patternOffset: number,
  existingAnchorCount: number,
  x: number,
  y: number,
): number {
  if (existingAnchorCount === 0) return Number.POSITIVE_INFINITY;
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let anchorIndex = 0; anchorIndex < existingAnchorCount; anchorIndex += 1) {
    const anchorOffset = patternOffset + anchorIndex * 2;
    const directDeltaX = Math.abs(x - positions[anchorOffset]!);
    const directDeltaY = Math.abs(y - positions[anchorOffset + 1]!);
    const deltaX = Math.min(directDeltaX, 1 - directDeltaX);
    const deltaY = Math.min(directDeltaY, 1 - directDeltaY);
    minimumDistance = Math.min(minimumDistance, deltaX * deltaX + deltaY * deltaY);
  }
  return minimumDistance;
}

function createRandomNumberGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function validatePatternInput(seed: number, patternCount: number, anchorsPerCell: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('seed must be an unsigned 32-bit integer.');
  }
  if (!Number.isInteger(patternCount) || patternCount < 1) {
    throw new Error('patternCount must be a positive integer.');
  }
  if (!Number.isInteger(anchorsPerCell) || anchorsPerCell < 1) {
    throw new Error('anchorsPerCell must be a positive integer.');
  }
}
