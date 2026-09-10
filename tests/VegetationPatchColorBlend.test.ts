import { describe, expect, it } from 'vitest';
import {
  combinePatchDistances,
  coverageFromDistance,
  evaluatePatchDistance,
  evaluatePatchFieldValue,
  type PatchSource,
} from '../src/runtime/profiles/grass/patches/GrassGroundPatchNoise.js';
import type { EnabledGrassGroundPatchConfig } from '../src/runtime/profiles/grass/patches/types.js';

const config: EnabledGrassGroundPatchConfig = {
  enabled: true, seed: 0, radiusMeters: { minimum: 6, maximum: 6 },
  targetCoverage: 0.65, allowMerging: true, edgeFalloffMeters: 5,
  shapeDistortion: 0, colors: { baseColor: '#3aa935', brightnessVariation: 0.05 },
};
const sources: readonly PatchSource[] = [
  { centerX: 0, centerY: 0, radiusMeters: 6, stretch: 1, cosine: 1, sine: 0, colorVariation: -1 },
  { centerX: 8, centerY: 0, radiusMeters: 6, stretch: 1, cosine: 1, sine: 0, colorVariation: 1 },
];

// Subtract the neutral-source result to isolate patch colors from broad color noise.
function patchColor(x: number, patches: readonly PatchSource[], settings = config): number {
  const value = evaluatePatchFieldValue(x, 0, patches, settings, 42);
  const neutral = evaluatePatchFieldValue(x, 0, patches.map((source) => ({
    ...source, colorVariation: 0,
  })), settings, 42);
  return (value.colorVariation - neutral.colorVariation) * value.coverage;
}

describe('Vegetation patch color falloff', () => {
  it('uses the configured falloff to blend overlapping patch colors', () => {
    const narrow = patchColor(3, sources, { ...config, edgeFalloffMeters: 1 });
    const wide = patchColor(3, sources);
    const leftWeight = coverageFromDistance(-3, 5);
    const rightWeight = coverageFromDistance(-1, 5);
    const coverage = evaluatePatchFieldValue(3, 0, sources, config, 42).coverage;

    expect(narrow).toBeCloseTo(0);
    expect(wide).toBeCloseTo(0.85 * (rightWeight - leftWeight)
      / (leftWeight + rightWeight) * coverage);
    expect(wide).toBeLessThan(-0.3);
    expect(patchColor(4, sources)).toBeCloseTo(0);
    expect(patchColor(5, sources)).toBeCloseTo(-wide);
  });

  it('fades a single patch to base color across the full five-meter edge', () => {
    for (const depth of [0, 0.1, 1, 2.5, 4, 5]) {
      expect(patchColor(6 - depth, [sources[0]!]))
        .toBeCloseTo(-0.85 * coverageFromDistance(-depth, 5));
    }
    expect(patchColor(6.1, [sources[0]!])).toBe(0);
  });

  it('blends continuously when another source starts contributing', () => {
    expect(Math.abs(patchColor(2.001, sources) - patchColor(1.999, sources)))
      .toBeLessThan(0.001);
    expect(patchColor(3, [...sources].reverse())).toBeCloseTo(patchColor(3, sources));
  });

  it('does not change coverage or introduce color into a smooth-union bridge', () => {
    const touching = [sources[0]!, { ...sources[1]!, centerX: 12 }];
    const value = evaluatePatchFieldValue(6, 0, touching, config, 42);
    expect(value.coverage).toBeGreaterThan(0);
    expect(value.colorVariation).toBe(0);
    for (const edgeFalloffMeters of [0, 1, 5]) {
      const settings = { ...config, edgeFalloffMeters };
      for (let x = -6; x <= 14; x += 0.25) {
        const distances = sources.map((source) => evaluatePatchDistance(x, 0, source));
        const distance = combinePatchDistances(distances[0]!, distances[1]!, settings);
        expect(evaluatePatchFieldValue(x, 0, sources, settings, 42).coverage)
          .toBeCloseTo(coverageFromDistance(distance, edgeFalloffMeters));
      }
    }
  });
});
