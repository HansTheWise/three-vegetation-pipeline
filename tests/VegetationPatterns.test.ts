import { describe, expect, it } from 'vitest';

import {
  createLodAnchorCounts,
  createVegetationPatterns,
  selectCellPattern,
} from '../src/index.js';

const patternConfig = {
  patternCount: 4,
  anchorsPerCell: 8,
  rotatePerCell: true,
  reflectPerCell: true,
} as const;

describe('VegetationPatterns', () => {
  it('creates reproducible normalized patterns from the VEGFILE seed', () => {
    const first = createVegetationPatterns(42, patternConfig);
    const second = createVegetationPatterns(42, patternConfig);

    expect(first.patternCount).toBe(4);
    expect(first.anchorsPerPattern).toBe(8);
    expect(first.anchorPositions).toEqual(second.anchorPositions);
    expect(first.anchorPositions).toHaveLength(4 * 8 * 2);
    for (const coordinate of first.anchorPositions) {
      expect(coordinate).toBeGreaterThanOrEqual(0);
      expect(coordinate).toBeLessThan(1);
    }
  });

  it('halves anchor density dynamically for each later LOD', () => {
    expect([...createLodAnchorCounts(8)]).toEqual([8, 4, 2]);
    expect([...createLodAnchorCounts(5)]).toEqual([5, 3, 2]);
  });

  it('assigns pattern transforms reproducibly and respects disabled transforms', () => {
    const selection = selectCellPattern(42, 7, 12, 9, patternConfig);

    expect(selectCellPattern(42, 7, 12, 9, patternConfig)).toEqual(selection);
    expect(selection.patternIndex).toBeGreaterThanOrEqual(0);
    expect(selection.patternIndex).toBeLessThan(patternConfig.patternCount);
    expect(selection.rotationQuarterTurns).toBeGreaterThanOrEqual(0);
    expect(selection.rotationQuarterTurns).toBeLessThanOrEqual(3);

    expect(selectCellPattern(42, 7, 12, 9, {
      ...patternConfig,
      rotatePerCell: false,
      reflectPerCell: false,
    })).toMatchObject({ rotationQuarterTurns: 0, reflected: false });
  });
});
