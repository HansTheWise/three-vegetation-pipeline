import { describe, expect, it } from 'vitest';

import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import { groundColorConfig } from './fixtures/groundColorConfig.js';
import {
  createGrassLayerConfig,
  evaluateVegetationDensityCurve,
  type VegetationRuntimeConfig,
  validateVegetationRuntimeConfig,
} from '../src/index.js';

describe('VegetationRuntimeConfig', () => {
  it('rejects removed vegetation patches with a coverage migration hint', () => {
    const config = structuredClone(vegetationRuntimeConfig);
    Object.assign(config.layers[0]!.patches, { vegetation: { enabled: false } });
    expect(() => validateVegetationRuntimeConfig(config)).toThrow('Use density.activeCells');
  });
  it('accepts independent ground color curves including a linear transition', () => {
    expect(() => validateVegetationRuntimeConfig(groundColorConfig)).not.toThrow();
  });

  it.each(['bottom', 'top'] as const)('rejects invalid %s ground color curves', (endpoint) => {
    for (const invalid of [
      { startsAtMeters: -1, endsAtMeters: 120, curveStrength: 1 },
      { startsAtMeters: 120, endsAtMeters: 120, curveStrength: 1 },
      { startsAtMeters: 150, endsAtMeters: 120, curveStrength: 1 },
      { startsAtMeters: 30, endsAtMeters: 120, curveStrength: -1 },
      { startsAtMeters: 30, endsAtMeters: 120, curveStrength: Number.NaN },
    ]) {
      const config = structuredClone(groundColorConfig);
      Object.assign(
        config.layers[0]!.renderProfile.colors.distanceColorTransition,
        { [endpoint]: invalid },
      );
      expect(() => validateVegetationRuntimeConfig(config))
        .toThrow(`distanceColorTransition.${endpoint}`);
    }
  });

  it('rejects a ground target without a ground field', () => {
    const config = structuredClone(groundColorConfig) as VegetationRuntimeConfig;
    Object.assign(config.layers[0]!.patches, { ground: { enabled: false } });
    expect(() => validateVegetationRuntimeConfig(config)).toThrow('enabled ground patches');
  });

  it('accepts continuous density values', () => {
    expect(() => validateVegetationRuntimeConfig(vegetationRuntimeConfig)).not.toThrow();
    const layer = vegetationRuntimeConfig.layers[0]!;
    expect(layer.shadows).toEqual({ cast: false, receive: true });
    expect(layer.lighting).toEqual({ directLightWeight: 0.35 });
    expect(layer.renderProfile.type).toBe('grass');
    expect(layer.renderProfile.blade).toMatchObject({ segments: 2, heightSampling: 'bilinear' });
    expect(layer.renderProfile.blade.cameraFacing).toEqual({
      startsAtMeters: 80,
      reachesFullAtMeters: 140,
    });
    expect(layer.patches).toEqual({ ground: { enabled: false } });
    expect(evaluateVegetationDensityCurve(layer.density.activeCells, 126)).toBe(0.568);
    expect(evaluateVegetationDensityCurve(layer.density.activeAnchors, 127)).toBe(0.345);
  });

  it('interpolates density deterministically and clamps to the curve ends', () => {
    const curve = [
      { distanceMeters: 0, ratio: 1 },
      { distanceMeters: 100, ratio: 0.5 },
      { distanceMeters: 200, ratio: 0 },
    ] as const;
    expect(evaluateVegetationDensityCurve(curve, -10)).toBe(1);
    expect(evaluateVegetationDensityCurve(curve, 50)).toBe(0.75);
    expect(evaluateVegetationDensityCurve(curve, 150)).toBe(0.25);
    expect(evaluateVegetationDensityCurve(curve, 300)).toBe(0);
  });

  it('contains serializable data and no function references', () => {
    expect(JSON.parse(JSON.stringify(vegetationRuntimeConfig)))
      .toEqual(vegetationRuntimeConfig);
    expect(containsFunction(vegetationRuntimeConfig)).toBe(false);
  });

  it('rejects duplicate layer identities', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...vegetationRuntimeConfig,
      layers: [layer, { ...layer, key: 'other-grass' }],
    } satisfies VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('Runtime layer ID 0 is duplicated.');
  });

  it('validates enabled patch generation values through the runtime config', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...vegetationRuntimeConfig,
      layers: [{
        ...layer,
        patches: {
          ground: {
            enabled: true,
            seed: 0,
            radiusMeters: { minimum: 8, maximum: 32 },
            targetCoverage: 2,
            allowMerging: true,
            edgeFalloffMeters: 3,
            shapeDistortion: 0.35,
            colors: { baseColor: '#39a83a', brightnessVariation: 0.08 },
          },
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('Vegetation patches.targetCoverage must be between 0 and 1.');
  });

  it('rejects invalid render-tile sizes and empty density curves', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalidTileSize = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, density: { ...layer.density, renderTileSizeCells: 0 } }],
    } satisfies VegetationRuntimeConfig;
    const emptyCurve = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, density: { ...layer.density, activeCells: [] } }],
    } satisfies VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(invalidTileSize))
      .toThrow('density.renderTileSizeCells must be an integer greater than or equal to 1.');
    expect(() => validateVegetationRuntimeConfig(emptyCurve))
      .toThrow('density.activeCells must not be empty.');
  });

  it('rejects unordered, increasing and unnormalized density curves', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalidCurves = [
      {
        points: [{ distanceMeters: 1, ratio: 1 }],
        message: 'density.activeCells[0].distanceMeters must be 0.',
      },
      {
        points: [{ distanceMeters: 0, ratio: 1 }, { distanceMeters: 0, ratio: 0.5 }],
        message: 'density.activeCells distances must strictly increase.',
      },
      {
        points: [{ distanceMeters: 0, ratio: 0.5 }, { distanceMeters: 10, ratio: 0.75 }],
        message: 'density.activeCells ratios must not increase with distance.',
      },
      {
        points: [{ distanceMeters: 0, ratio: 1.1 }],
        message: 'density.activeCells[0].ratio must be between 0 and 1.',
      },
    ];
    for (const { points, message } of invalidCurves) {
      const config = {
        ...vegetationRuntimeConfig,
        layers: [{ ...layer, density: { ...layer.density, activeCells: points } }],
      } as VegetationRuntimeConfig;
      expect(() => validateVegetationRuntimeConfig(config)).toThrow(message);
    }
  });

  it('requires density to reach zero before the visibility cutoff', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const nonZeroCurve = [
      { distanceMeters: 0, ratio: 1 },
      { distanceMeters: 500, ratio: 0.1 },
    ] as const;
    const config = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, density: {
        ...layer.density,
        activeCells: nonZeroCurve,
        activeAnchors: nonZeroCurve,
        activeElements: nonZeroCurve,
      } }],
    } satisfies VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(config))
      .toThrow('density must reach zero by visibility.maximumDistanceMeters.');
  });

  it('rejects invalid fixed blade quality', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalidSegments = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, renderProfile: {
        ...layer.renderProfile,
        blade: { ...layer.renderProfile.blade, segments: 0 },
      } }],
    } as VegetationRuntimeConfig;
    const invalidSampling = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, renderProfile: {
        ...layer.renderProfile,
        blade: { ...layer.renderProfile.blade, heightSampling: 'nearest' },
      } }],
    } as unknown as VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(invalidSegments))
      .toThrow('blade.segments must be an integer greater than or equal to 1.');
    expect(() => validateVegetationRuntimeConfig(invalidSampling))
      .toThrow('blade.heightSampling is unsupported.');
  });

  it('rejects an invalid camera-facing transition', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, renderProfile: {
        ...layer.renderProfile,
        blade: {
          ...layer.renderProfile.blade,
          cameraFacing: { startsAtMeters: 140, reachesFullAtMeters: 80 },
        },
      } }],
    } satisfies VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('blade.cameraFacing end distance must be greater than start distance.');
  });

  it('rejects an invalid direct light weight', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, lighting: { directLightWeight: 1.1 } }],
    } satisfies VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('lighting.directLightWeight must be between 0 and 1.');
  });

  it('rejects invalid colors, ranges, pattern counts and distribution counts', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const invalidColor = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, renderProfile: {
        ...layer.renderProfile,
        colors: { ...layer.renderProfile.colors, bottomColors: ['#grass'] },
      } }],
    } as unknown as VegetationRuntimeConfig;
    const invalidRange = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, renderProfile: {
        ...layer.renderProfile,
        blade: {
          ...layer.renderProfile.blade,
          heightMeters: { minimum: 0.3, maximum: 0.2 },
        },
      } }],
    } satisfies VegetationRuntimeConfig;
    const tooManyPatterns = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, pattern: { ...layer.pattern, patternCount: 257 } }],
    } satisfies VegetationRuntimeConfig;
    const invalidCount = {
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, distribution: { ...layer.distribution, anchorsPerCell: 0 } }],
    } satisfies VegetationRuntimeConfig;
    expect(() => validateVegetationRuntimeConfig(invalidColor)).toThrow('six-digit hex color');
    expect(() => validateVegetationRuntimeConfig(invalidRange)).toThrow('maximum must be at least');
    expect(() => validateVegetationRuntimeConfig(tooManyPatterns)).toThrow('must not exceed 256');
    expect(() => validateVegetationRuntimeConfig(invalidCount)).toThrow('anchorsPerCell');
  });

  it('reports old runtime schemas without interpreting them as version 3', () => {
    const config = { ...vegetationRuntimeConfig, configVersion: 2 };
    expect(() => validateVegetationRuntimeConfig(config as unknown as VegetationRuntimeConfig))
      .toThrow('Use version 3');
  });

  it('accepts a non-grass layer without grass profile fields', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const customLayer = {
      ...layer,
      key: 'tree-layer',
      renderBounds: {
        horizontalPaddingMeters: 3,
        belowSurfaceMeters: 0.5,
        aboveSurfaceMeters: 12,
      },
      lighting: { leafTranslucency: 0.5 },
      renderProfile: { type: 'test-tree', modelScale: 1 },
    };
    const config = {
      ...vegetationRuntimeConfig,
      layers: [customLayer],
    } satisfies VegetationRuntimeConfig;

    expect('blade' in customLayer).toBe(false);
    expect(customLayer.lighting).toEqual({ leafTranslucency: 0.5 });
    expect(() => validateVegetationRuntimeConfig(config)).not.toThrow();
  });

  it('creates a complete grass preset and derives bounds from profile overrides', () => {
    const layer = createGrassLayerConfig({
      layerId: 4,
      key: 'tall-grass',
      grass: {
        blade: {
          heightMeters: { minimum: 1.5, maximum: 2 },
          maximumTiltDegrees: 30,
        },
      },
      shadows: { cast: true },
    });
    const config = { configVersion: 3, layers: [layer] } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(config)).not.toThrow();
    expect(layer.shadows).toEqual({ cast: true, receive: true });
    expect(layer.renderProfile.blade.segments).toBe(2);
    expect(layer.renderBounds.aboveSurfaceMeters).toBe(2);
    expect(layer.renderBounds.horizontalPaddingMeters).toBeGreaterThan(1);
  });

  it('rejects grass bounds that do not contain the configured geometry', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const config = {
      ...vegetationRuntimeConfig,
      layers: [{
        ...layer,
        renderBounds: {
          ...layer.renderBounds,
          aboveSurfaceMeters: layer.renderProfile.blade.heightMeters.maximum - 0.01,
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(config))
      .toThrow('renderBounds.aboveSurfaceMeters does not contain the grass profile');
  });
});

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some(containsFunction);
}
