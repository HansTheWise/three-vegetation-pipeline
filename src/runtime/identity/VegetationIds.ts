import type { VegetationCellId } from './types.js';
import { ELEMENT_DETAIL_HASH_SALT } from './ElementHashLayout.js';

export const VEGETATION_ID_UINT32_MAX = 0xffff_ffff;

export const VEGETATION_HASH_SALTS = {
  layer: 0x9e3779b9,
  cellX: 0x85ebca6b,
  cellY: 0xc2b2ae35,
  anchor: 0x27d4eb2f,
  element: 0x165667b1,
} as const;

/** Hashes the complete stable cell identity with one final avalanche mix. */
export function hashVegetationCell(seed: number, id: VegetationCellId): number {
  validateUint32(seed, 'seed');
  validateUint32(id.layerId, 'layerId');
  validateUint32(id.globalCellX, 'globalCellX');
  validateUint32(id.globalCellY, 'globalCellY');

  const combined = seed
    ^ Math.imul(id.layerId + 1, VEGETATION_HASH_SALTS.layer)
    ^ Math.imul(id.globalCellX + 1, VEGETATION_HASH_SALTS.cellX)
    ^ Math.imul(id.globalCellY + 1, VEGETATION_HASH_SALTS.cellY);
  return mixVegetationHash(combined);
}

/** Derives one stable anchor hash without rebuilding the cell identity. */
export function hashVegetationAnchor(cellHash: number, anchorIndex: number): number {
  validateUint32(cellHash, 'cellHash');
  validateUint32(anchorIndex, 'anchorIndex');
  return mixVegetationHash(
    cellHash ^ Math.imul(anchorIndex + 1, VEGETATION_HASH_SALTS.anchor),
  );
}

/** Derives one stable element hash without rebuilding its parent identities. */
export function hashVegetationElement(anchorHash: number, elementIndex: number): number {
  validateUint32(anchorHash, 'anchorHash');
  validateUint32(elementIndex, 'elementIndex');
  return mixVegetationHash(
    anchorHash ^ Math.imul(elementIndex + 1, VEGETATION_HASH_SALTS.element),
  );
}

/** Derives independent placement and color bytes from one stable Element hash. */
export function hashVegetationElementDetails(elementHash: number): number {
  validateUint32(elementHash, 'elementHash');
  return mixVegetationHash(elementHash ^ ELEMENT_DETAIL_HASH_SALT);
}

export function readVegetationHashBits(
  hash: number,
  offset: number,
  length: number,
): number {
  validateUint32(hash, 'hash');
  if (!Number.isInteger(offset) || offset < 0 || offset > 31) {
    throw new Error('Hash bit offset must be an integer between 0 and 31.');
  }
  if (!Number.isInteger(length) || length < 1 || length > 31 - offset + 1) {
    throw new Error('Hash bit length must fit the unsigned 32-bit value.');
  }
  const mask = length === 32 ? VEGETATION_ID_UINT32_MAX : (2 ** length) - 1;
  return ((hash >>> offset) & mask) >>> 0;
}

export function selectVegetationHashIndex(value: number, optionCount: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Hash selection value must be a non-negative integer.');
  }
  if (!Number.isInteger(optionCount) || optionCount < 1) {
    throw new Error('Hash optionCount must be a positive integer.');
  }
  return value % optionCount;
}

export function mixVegetationHash(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function validateUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > VEGETATION_ID_UINT32_MAX) {
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
  }
}
