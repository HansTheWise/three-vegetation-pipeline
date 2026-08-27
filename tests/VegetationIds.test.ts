import { describe, expect, it } from 'vitest';

import {
  CELL_PATTERN_BITS,
  CELL_REFLECTION_BITS,
  CELL_ROTATION_BITS,
  hashVegetationAnchor,
  hashVegetationCell,
  hashVegetationElement,
  hashVegetationElementDetails,
  readVegetationHashBits,
  selectCellPattern,
  selectVegetationHashIndex,
  vegetationIdentityShader,
} from '../src/index.js';

const patternConfig = {
  patternCount: 4,
  anchorsPerCell: 8,
  rotatePerCell: true,
  reflectPerCell: true,
} as const;

describe('stable vegetation identities', () => {
  it('creates deterministic hierarchical hashes from explicit IDs', () => {
    const cellHash = hashVegetationCell(42, {
      layerId: 7,
      globalCellX: 12,
      globalCellY: 9,
    });
    const anchorHash = hashVegetationAnchor(cellHash, 3);
    const elementHash = hashVegetationElement(anchorHash, 5);

    expect(cellHash).toBe(0xd298_42e9);
    expect(anchorHash).toBe(0x4f85_f1e1);
    expect(elementHash).toBe(0x61b7_3daf);
    expect(hashVegetationElementDetails(elementHash)).toBe(0x98df_35f7);
    expect(hashVegetationCell(42, {
      layerId: 7,
      globalCellX: 12,
      globalCellY: 9,
    })).toBe(cellHash);
    expect(hashVegetationAnchor(cellHash, 3)).toBe(anchorHash);
    expect(hashVegetationElement(anchorHash, 5)).toBe(elementHash);
    expect(hashVegetationCell(42, {
      layerId: 7,
      globalCellX: 13,
      globalCellY: 9,
    })).not.toBe(cellHash);
    expect(hashVegetationAnchor(cellHash, 4)).not.toBe(anchorHash);
    expect(hashVegetationElement(anchorHash, 6)).not.toBe(elementHash);
  });

  it('reads the centrally assigned cell fields from one hash', () => {
    const hash = 0x8000_07ff;

    expect(readVegetationHashBits(
      hash,
      CELL_PATTERN_BITS.offset,
      CELL_PATTERN_BITS.length,
    )).toBe(255);
    expect(readVegetationHashBits(
      hash,
      CELL_ROTATION_BITS.offset,
      CELL_ROTATION_BITS.length,
    )).toBe(3);
    expect(readVegetationHashBits(
      hash,
      CELL_REFLECTION_BITS.offset,
      CELL_REFLECTION_BITS.length,
    )).toBe(1);
    expect(readVegetationHashBits(hash, 0, 32)).toBe(hash);
  });

  it('uses the same cell fields for CPU pattern selection', () => {
    const cellHash = hashVegetationCell(42, {
      layerId: 7,
      globalCellX: 12,
      globalCellY: 9,
    });
    const selection = selectCellPattern(42, 7, 12, 9, patternConfig);

    expect(selection).toEqual({
      patternIndex: selectVegetationHashIndex(
        readVegetationHashBits(cellHash, 0, 8),
        patternConfig.patternCount,
      ),
      rotationQuarterTurns: readVegetationHashBits(cellHash, 8, 2),
      reflected: readVegetationHashBits(cellHash, 10, 1) === 1,
    });
  });

  it('generates GLSL readers from the shared identity contract', () => {
    expect(vegetationIdentityShader).toContain('uint vegetationCellHash');
    expect(vegetationIdentityShader).toContain('uint vegetationAnchorHash');
    expect(vegetationIdentityShader).toContain('uint vegetationElementHash');
    expect(vegetationIdentityShader).toContain('uint vegetationElementDetailHash');
    expect(vegetationIdentityShader).toContain('uint cellPatternValue');
    expect(vegetationIdentityShader).toContain('uint cellRotationQuarterTurns');
    expect(vegetationIdentityShader).toContain('bool cellIsReflected');
    expect(vegetationIdentityShader).toContain('0x9e3779b9u');
  });

  it('rejects values outside the unsigned 32-bit contract', () => {
    expect(() => hashVegetationCell(-1, {
      layerId: 0,
      globalCellX: 0,
      globalCellY: 0,
    })).toThrow('seed must be an unsigned 32-bit integer.');
    expect(() => hashVegetationElement(0, 0x1_0000_0000))
      .toThrow('elementIndex must be an unsigned 32-bit integer.');
    expect(() => readVegetationHashBits(0, 31, 2))
      .toThrow('Hash bit length must fit the unsigned 32-bit value.');
  });
});
