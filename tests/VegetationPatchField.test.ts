import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { evaluatePatchDistance, warpPatchPosition } from '../src/runtime/profiles/grass/patches/GrassGroundPatchNoise.js';

import {
  createGrassGroundPatchField,
  sampleGrassGroundPatchField,
  type EnabledGrassGroundPatchConfig,
  type ParsedVegFile,
  validateGrassGroundPatchConfig,
} from '../src/index.js';

const patchConfig = {
  enabled: true,
  seed: 7,
  radiusMeters: {
    minimum: 2,
    maximum: 4,
  },
  targetCoverage: 0.5,
  allowMerging: true,
  edgeFalloffMeters: 1,
  shapeDistortion: 0.35,
  colors: {
    baseColor: '#39a83a',
    brightnessVariation: 0.08,
  },
} as const satisfies EnabledGrassGroundPatchConfig;

describe('GrassGroundPatchField', () => {
  it.each([
    [true, 0, 0], [true, 1, 7], [true, 5, 42],
    [false, 0, 0], [false, 1, 7], [false, 5, 42],
  ] as const)('preserves the field when indexing sources (merge=%s, falloff=%s, seed=%s)',
    (allowMerging, edgeFalloffMeters, seed) => {
      const field = createGrassGroundPatchField(createParsedFile(), 0, {
        ...patchConfig, allowMerging, edgeFalloffMeters, seed,
      })!;
      expect({
        patchCount: field.patchCount,
        achievedCoverage: field.achievedCoverage,
        hash: createHash('sha256').update(field.data).digest('hex'),
      }).toMatchSnapshot();
    });

  it('creates a bit-identical global RG8 field for the same input', () => {
    const file = createParsedFile();
    const first = createGrassGroundPatchField(file, 0, patchConfig)!;
    const second = createGrassGroundPatchField(file, 0, patchConfig)!;

    expect(first).toMatchObject({
      layerId: 0,
      width: 128,
      height: 64,
      texelSizeUnits: 0.25,
      texelSizeMeters: 0.25,
      originX: -8,
      originY: 4,
      baseColor: '#39a83a',
      brightnessVariation: 0.08,
    });
    expect(first.patchCount).toBeGreaterThan(0);
    expect(first.data).toEqual(second.data);
    expect(first.achievedCoverage).toBe(second.achievedCoverage);
  });

  it('changes the field when either deterministic seed changes', () => {
    const file = createParsedFile();
    const patchSeedChange = createGrassGroundPatchField(file, 0, {
      ...patchConfig,
      seed: patchConfig.seed + 1,
    })!;
    const vegSeedChange = createGrassGroundPatchField({
      ...file,
      header: { ...file.header, seed: file.header.seed + 1 },
    }, 0, patchConfig)!;
    const baseline = createGrassGroundPatchField(file, 0, patchConfig)!;

    expect(patchSeedChange.data).not.toEqual(baseline.data);
    expect(vegSeedChange.data).not.toEqual(baseline.data);
  });

  it('does not use stored chunk order as a spatial identity', () => {
    const ordered = createGrassGroundPatchField(createParsedFile(), 0, patchConfig)!;
    const reordered = createGrassGroundPatchField(createParsedFile({
      chunkLookup: [1, 0],
    }), 0, patchConfig)!;

    expect(reordered.data).toEqual(ordered.data);
  });

  it('approaches target coverage over vegetation-eligible samples', () => {
    const field = createGrassGroundPatchField(createParsedFile(), 0, patchConfig)!;

    expect(field.eligibleSampleCount).toBe(field.width * field.height);
    expect(field.achievedCoverage).toBeCloseTo(patchConfig.targetCoverage, 1);
  });

  it('keeps ineligible mask regions empty', () => {
    const field = createGrassGroundPatchField(
      createParsedFile({ activeStoredChunks: [0] }),
      0,
      patchConfig,
    )!;

    expect(field.eligibleSampleCount).toBe(field.width * field.height / 2);
    for (let pixelY = 0; pixelY < field.height; pixelY += 1) {
      for (let pixelX = field.width / 2; pixelX < field.width; pixelX += 1) {
        const pixelOffset = (pixelY * field.width + pixelX) * 2;
        expect(field.data[pixelOffset]).toBe(0);
      }
    }
  });

  it('samples continuously across a VEGFILE chunk boundary', () => {
    const field = createGrassGroundPatchField(createParsedFile(), 0, patchConfig)!;
    const boundaryX = 8;
    const left = sampleGrassGroundPatchField(field, boundaryX - 0.001, 12);
    const right = sampleGrassGroundPatchField(field, boundaryX + 0.001, 12);

    expect(Math.abs(left.coverageByte - right.coverageByte)).toBeLessThanOrEqual(1);
    expect(Math.abs(left.colorVariationByte - right.colorVariationByte)).toBeLessThanOrEqual(1);
  });

  it('derives resolution from radius and edge falloff', () => {
    const hardEdgeField = createGrassGroundPatchField(createParsedFile(), 0, {
      ...patchConfig,
      radiusMeters: { minimum: 4, maximum: 4 },
      edgeFalloffMeters: 0,
    })!;
    const wideFalloffField = createGrassGroundPatchField(createParsedFile(), 0, {
      ...patchConfig,
      radiusMeters: { minimum: 4, maximum: 4 },
      edgeFalloffMeters: 1,
    })!;

    expect(hardEdgeField.texelSizeMeters).toBe(0.5);
    expect(wideFalloffField.texelSizeMeters).toBe(0.25);
  });

  it('strongly deforms a circular source at maximum shape distortion', () => {
    const config = { ...patchConfig, shapeDistortion: 1 };
    const center = warpPatchPosition(7, 13, config, 42);
    const source = {
      centerX: center.x, centerY: center.y, radiusMeters: 4,
      stretch: 1, cosine: 1, sine: 0, colorVariation: 0,
    };
    const radii = Array.from({ length: 64 }, (_, index) => {
      const angle = index * Math.PI * 2 / 64;
      for (let radius = 0.01; radius <= 16; radius += 0.01) {
        const position = warpPatchPosition(
          7 + Math.cos(angle) * radius, 13 + Math.sin(angle) * radius, config, 42,
        );
        if (evaluatePatchDistance(position.x, position.y, source) >= 0) return radius;
      }
      return 16;
    });
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.8);
    const lobes = radii.filter((radius, index) => (
      radius > radii[(index + radii.length - 1) % radii.length]!
      && radius > radii[(index + 1) % radii.length]!
    ));
    expect(lobes.length).toBeGreaterThanOrEqual(3);
  });

  it('bounds global field memory even for very small requested edge falloff', () => {
    const field = createGrassGroundPatchField(createParsedFile(), 0, {
      ...patchConfig, edgeFalloffMeters: 0.001, targetCoverage: 0,
    })!;
    expect(Math.max(field.width, field.height)).toBe(1024);
    expect(field.data.byteLength).toBeLessThanOrEqual(1024 * 1024 * 2);
  });

  it('supports separated and merging source-patch placement', () => {
    const merging = createGrassGroundPatchField(createParsedFile(), 0, patchConfig)!;
    const separated = createGrassGroundPatchField(createParsedFile(), 0, {
      ...patchConfig,
      allowMerging: false,
    })!;

    expect(merging.patchCount).toBeGreaterThan(0);
    expect(separated.patchCount).toBeGreaterThan(0);
    expect(merging.data).not.toEqual(separated.data);
  });

  it('skips every allocation for a disabled config', () => {
    expect(createGrassGroundPatchField(createParsedFile(), 999, { enabled: false }))
      .toBeUndefined();
  });

  it('rejects invalid radii, coverage, distortion, seed and color values', () => {
    expect(() => validateGrassGroundPatchConfig({
      ...patchConfig,
      radiusMeters: { minimum: 4, maximum: 2 },
    })).toThrow('radiusMeters.maximum must be at least minimum');
    expect(() => validateGrassGroundPatchConfig({
      ...patchConfig,
      targetCoverage: 1.1,
    })).toThrow('targetCoverage must be between 0 and 1');
    expect(() => validateGrassGroundPatchConfig({
      ...patchConfig,
      shapeDistortion: Number.NaN,
    })).toThrow('shapeDistortion must be between 0 and 1');
    expect(() => validateGrassGroundPatchConfig({
      ...patchConfig,
      seed: -1,
    })).toThrow('seed must be an unsigned 32-bit integer');
    expect(() => validateGrassGroundPatchConfig({
      ...patchConfig,
      colors: { ...patchConfig.colors, baseColor: '#green' },
    })).toThrow('baseColor must be a six-digit hex color');
    expect(() => validateGrassGroundPatchConfig({
      ...patchConfig,
      colors: { ...patchConfig.colors, brightnessVariation: 1.1 },
    })).toThrow('brightnessVariation must be between 0 and 1');
  });
});

function createParsedFile(options: Readonly<{
  activeStoredChunks?: readonly number[];
  chunkLookup?: readonly number[];
}> = {}): ParsedVegFile {
  const gridWidth = 2;
  const gridHeight = 1;
  const maskResolution = 16;
  const maskWordsPerChunk = maskResolution * maskResolution / 32;
  const storedChunkCount = gridWidth * gridHeight;
  const activeStoredChunks = new Set(
    options.activeStoredChunks ?? Array.from({ length: storedChunkCount }, (_, index) => index),
  );
  const maskData = new Uint32Array(storedChunkCount * maskWordsPerChunk);
  for (let storedChunkIndex = 0;
    storedChunkIndex < storedChunkCount;
    storedChunkIndex += 1) {
    if (!activeStoredChunks.has(storedChunkIndex)) continue;
    maskData.fill(
      0xffff_ffff,
      storedChunkIndex * maskWordsPerChunk,
      (storedChunkIndex + 1) * maskWordsPerChunk,
    );
  }

  return {
    bytes: new Uint8Array(),
    header: {
      version: 1,
      fileSize: 0,
      seed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: {
        minX: -8,
        minY: 0,
        minZ: 4,
        maxX: 24,
        maxY: 2,
        maxZ: 20,
      },
      coordinateSystem: {
        upAxis: 'y',
        horizontalAxes: ['x', 'z'],
        unitsPerMeter: 1,
      },
      grid: {
        width: gridWidth,
        height: gridHeight,
        chunkSize: 16,
        originX: -8,
        originY: 4,
      },
      storedChunkCount,
      heightMap: {
        resolution: 2,
        valueBits: 16,
        valuesPerChunk: 4,
      },
    },
    chunkLookup: Int32Array.from(options.chunkLookup ?? [0, 1]),
    chunkHeightRanges: Float32Array.from([0, 1, 0, 1]),
    heightData: Uint16Array.from([0, 0, 0, 0, 0, 0, 0, 0]),
    layers: [{
      id: 0,
      maskResolution,
      maskWordsPerChunk,
      maskData,
    }],
  };
}
