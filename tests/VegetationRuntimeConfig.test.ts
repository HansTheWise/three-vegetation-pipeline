import { describe, expect, it } from 'vitest';
import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';
import { icakaVegetationConfig } from '../config/icaka.vegetation.config.js';
import type { VegetationRuntimeConfig } from '../src/runtime/config/types.js';
import { validateVegetationRuntimeConfig } from '../src/runtime/config/validateVegetationRuntimeConfig.js';

describe('VegetationRuntimeConfig', () => {
  it('accepts the initial I-CAKA frontend values', () => {
    expect(() => validateVegetationRuntimeConfig(icakaVegetationRuntimeConfig))
      .not.toThrow();
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    expect([
      layer.visibility.maximumDistanceMeters,
      layer.bladeCount.reachesZeroAtMeters,
      layer.bladeThicknessDistanceScaling.reachesMaximumAtMeters,
      layer.colors.distanceColorTransition.endsAtMeters,
    ]).toEqual([500, 500, 500, 500]);
    expect(layer.shadows).toMatchObject({ receive: true, cast: false });
    expect(layer.bladeCount.maximumPerAnchor).toBe(1);
    expect(layer.bladeCount.lodTransitionStartVisibleRatio).toBe(0.25);
    expect(layer.lod.levels.map((level) => ({
      cells: level.cellCoverageRatio,
      anchors: level.anchorCount,
      elements: level.elementCount,
      segments: level.bladeSegments,
      height: level.heightSampling,
    }))).toEqual([
      { cells: 1, anchors: 4, elements: 1, segments: 2, height: 'bilinear' },
      { cells: 1, anchors: 3, elements: 1, segments: 2, height: 'bilinear' },
      { cells: 1, anchors: 2, elements: 1, segments: 2, height: 'bilinear' },
      { cells: 1, anchors: 1, elements: 1, segments: 2, height: 'bilinear' },
      { cells: 1 / 2, anchors: 1, elements: 1, segments: 1, height: 'diagonal-average' },
      { cells: 1 / 4, anchors: 1, elements: 1, segments: 1, height: 'diagonal-average' },
      { cells: 1 / 8, anchors: 1, elements: 1, segments: 1, height: 'diagonal-average' },
      { cells: 1 / 64, anchors: 1, elements: 1, segments: 1, height: 'diagonal-average' },
    ]);
  });

  it('connects runtime data to .veg data through stable layer IDs and keys', () => {
    const offlineLayers = icakaVegetationConfig.extraction.vegetationLayers
      .map(({ id, key }) => ({ id, key }));
    const runtimeLayers = icakaVegetationRuntimeConfig.layers
      .map(({ layerId: id, key }) => ({ id, key }));

    expect(runtimeLayers).toEqual(offlineLayers);
  });

  it('contains serializable data and no module or function references', () => {
    const serialized = JSON.stringify(icakaVegetationRuntimeConfig);
    const parsed = JSON.parse(serialized) as unknown;

    expect(parsed).toEqual(icakaVegetationRuntimeConfig);
    expect(containsFunction(icakaVegetationRuntimeConfig)).toBe(false);
  });

  it('rejects duplicate layer identities', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...icakaVegetationRuntimeConfig,
      layers: [layer, { ...layer, key: 'other-grass' }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('Runtime layer ID 0 is duplicated.');
  });

  it('rejects distance curves outside the visibility range', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        bladeCount: {
          ...layer.bladeCount,
          reachesZeroAtMeters: layer.visibility.maximumDistanceMeters + 1,
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('bladeCount end distance must be between 0 and 500.');
  });

  it('rejects non-positive render-tile sizes and empty LOD profiles', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalidTileSize = {
      ...icakaVegetationRuntimeConfig,
      layers: [{ ...layer, lod: { ...layer.lod, renderTileSizeCells: 0 } }],
    } satisfies VegetationRuntimeConfig;
    const emptyLevels = {
      ...icakaVegetationRuntimeConfig,
      layers: [{ ...layer, lod: { ...layer.lod, levels: [] } }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalidTileSize))
      .toThrow('lod.renderTileSizeCells must be an integer greater than or equal to 1.');
    expect(() => validateVegetationRuntimeConfig(emptyLevels))
      .toThrow('lod.levels must not be empty.');
  });

  it('rejects incomplete or increasing LOD density profiles', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const incomplete = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        lod: { ...layer.lod, levels: layer.lod.levels.slice(1) },
      }],
    } satisfies VegetationRuntimeConfig;
    const increasing = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        lod: {
          ...layer.lod,
          levels: [
            layer.lod.levels[0]!,
            { ...layer.lod.levels[1]!, anchorCount: 4 },
          ],
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(incomplete))
      .toThrow('lod.levels[0] must use the complete Cell, Anchor and Element density.');
    expect(() => validateVegetationRuntimeConfig(increasing))
      .toThrow('lod.levels must strictly decrease total density.');
  });

  it('rejects invalid blade geometry and height sampling', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalidSegments = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        lod: {
          ...layer.lod,
          levels: [
            { ...layer.lod.levels[0]!, bladeSegments: 0 },
            ...layer.lod.levels.slice(1),
          ],
        },
      }],
    } as unknown as VegetationRuntimeConfig;
    const invalidSampling = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        lod: {
          ...layer.lod,
          levels: [
            { ...layer.lod.levels[0]!, heightSampling: 'nearest' },
            ...layer.lod.levels.slice(1),
          ],
        },
      }],
    } as unknown as VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalidSegments))
      .toThrow('lod.levels[0].bladeSegments must be an integer greater than or equal to 1.');
    expect(() => validateVegetationRuntimeConfig(invalidSampling))
      .toThrow('lod.levels[0].heightSampling is unsupported.');
  });

  it('rejects a blade growth transition larger than the blade-count distance range', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        bladeCount: {
          ...layer.bladeCount,
          growthTransitionDistanceMeters: layer.bladeCount.reachesZeroAtMeters
            - layer.bladeCount.startsDecreasingAtMeters
            + 1,
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow(
        'bladeCount.growthTransitionDistanceMeters must not exceed the blade-count distance range.',
      );
  });

  it('rejects invalid colors and numeric ranges', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalidColor = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        colors: { ...layer.colors, bottomColors: ['#grass'] },
      }],
    } as unknown as VegetationRuntimeConfig;
    const invalidRange = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        blade: {
          ...layer.blade,
          heightMeters: { minimum: 0.3, maximum: 0.2 },
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalidColor))
      .toThrow('colors.bottomColors[0] must be a six-digit hex color.');
    expect(() => validateVegetationRuntimeConfig(invalidRange))
      .toThrow('blade.heightMeters.maximum must be at least minimum.');
  });

  it('rejects more patterns than the assigned Cell-ID bits can select', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        pattern: { ...layer.pattern, patternCount: 257 },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('pattern.patternCount must not exceed 256.');
  });

  it('rejects negative blade offsets and palettes larger than one hash byte', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const negativeOffset = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        bladeCount: { ...layer.bladeCount, maximumOffsetMeters: -0.01 },
      }],
    } satisfies VegetationRuntimeConfig;
    const oversizedPalette = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        colors: {
          ...layer.colors,
          topColors: new Array(257).fill('#000000') as `#${string}`[],
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(negativeOffset))
      .toThrow('bladeCount.maximumOffsetMeters must not be negative.');
    expect(() => validateVegetationRuntimeConfig(oversizedPalette))
      .toThrow('colors.topColors must not contain more than 256 colors.');
  });

  it('rejects an LOD transition start outside the visible blade range', () => {
    const layer = icakaVegetationRuntimeConfig.layers[0]!;
    const invalid = {
      ...icakaVegetationRuntimeConfig,
      layers: [{
        ...layer,
        bladeCount: {
          ...layer.bladeCount,
          lodTransitionStartVisibleRatio: 1.1,
        },
      }],
    } satisfies VegetationRuntimeConfig;

    expect(() => validateVegetationRuntimeConfig(invalid))
      .toThrow('bladeCount.lodTransitionStartVisibleRatio must be between 0 and 1.');
  });
});

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some(containsFunction);
}
