import { describe, expect, it } from 'vitest';

import {
  interpolateVegetationHeight,
  readVegetationElementVariation,
  readVegetationInstanceAddress,
  transformVegetationAnchor,
} from '../src/index.js';

describe('vegetation placement reference', () => {
  it('decomposes dense instance indices into chunk, Cell, Anchor and Element', () => {
    expect(readVegetationInstanceAddress(0, 2, 1, 3)).toEqual({
      visibleChunkIndex: 0,
      localCellX: 0,
      localCellY: 0,
      anchorIndex: 0,
      elementIndex: 0,
    });
    expect(readVegetationInstanceAddress(11, 2, 1, 3)).toEqual({
      visibleChunkIndex: 0,
      localCellX: 1,
      localCellY: 1,
      anchorIndex: 0,
      elementIndex: 2,
    });
    expect(readVegetationInstanceAddress(12, 2, 1, 3).visibleChunkIndex).toBe(1);
  });

  it('applies reflection before counter-clockwise quarter turns', () => {
    expect(transformVegetationAnchor(0.2, 0.3, 1, true)).toEqual([0.7, 0.8]);
    expect(transformVegetationAnchor(0.2, 0.3, 2, false)).toEqual([0.8, 0.7]);
  });

  it('reads independent normalized form, placement, and color values', () => {
    expect(readVegetationElementVariation(0x61b7_3daf)).toEqual({
      height: 175 / 255,
      width: 61 / 255,
      orientation: 183 / 255,
      tilt: 97 / 255,
      offsetAngle: 247 / 255,
      offsetRadius: 53 / 255,
      bottomColorValue: 223,
      topColorValue: 152,
    });
  });

  it('bilinearly interpolates decoded height samples and clamps chunk edges', () => {
    const heights = Uint16Array.from([0, 65_535, 0, 65_535]);
    expect(interpolateVegetationHeight(
      heights,
      0,
      2,
      10,
      20,
      65_535,
      0.25,
      0.75,
    )).toBeCloseTo(12.5);
    expect(interpolateVegetationHeight(
      heights,
      0,
      2,
      10,
      20,
      65_535,
      2,
      0.5,
    )).toBe(20);
  });
});
