import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compileGlbToVeg,
  type VegCompilerConfig,
} from '../src/offline/compiler/VegCompiler.js';
import { createVegFile } from '../src/offline/compiler/NodeVegCompiler.js';
import { createMinimalGlb } from './fixtures/createMinimalGlb.js';

describe('VegCompiler', () => {
  it('runs Reader, Extractor and Writer as one deterministic offline pipeline', async () => {
    const result = await compileGlbToVeg(createMinimalGlb(), createConfig());

    expect(String.fromCharCode(...result.file.subarray(0, 8))).toBe('VEGFILE\0');
    expect(result.dataset.seed).toBe(42);
    expect(result.buildFingerprint).toHaveLength(16);
    expect(result.dataset.layers[0]!.maskResolution).toBe(4);
    expect(result.report).toEqual({
      sourceMeshCount: 1,
      triangleCount: 1,
      possibleChunkCount: 1,
      storedChunkCount: 1,
      heightResolution: 3,
      heightValueBits: 16,
      seed: 42,
      buildFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/),
      fileByteLength: 180,
      layers: [{
        id: 5,
        key: 'test-grass',
        maskResolution: 4,
        activeCellCount: 1,
        packedMaskByteLength: 4,
      }],
    });
  });

  it('creates stable fingerprints and changes them with the compiler config', async () => {
    const source = createMinimalGlb();
    const config = createConfig();
    const first = await compileGlbToVeg(source, config);
    const second = await compileGlbToVeg(source, config);
    const reordered = await compileGlbToVeg(source, {
      output: config.output,
      extraction: config.extraction,
      source: config.source,
      coordinateSystem: config.coordinateSystem,
    });
    const changed = await compileGlbToVeg(source, {
      ...config,
      output: { ...config.output, heightValueBits: 8 },
    });

    expect(second.buildFingerprint).toEqual(first.buildFingerprint);
    expect(reordered.buildFingerprint).toEqual(first.buildFingerprint);
    expect(changed.buildFingerprint).not.toEqual(first.buildFingerprint);
    expect(second.file).toEqual(first.file);
  });

  it('atomically replaces a requested .veg file and leaves no temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'veg-compiler-'));
    const inputPath = join(directory, 'model.glb');
    const outputPath = join(directory, 'model.veg');
    try {
      await writeFile(inputPath, new Uint8Array(createMinimalGlb()));
      await writeFile(outputPath, 'old-file');

      const result = await createVegFile({
        inputPath,
        outputPath,
        config: createConfig(),
      });
      const writtenFile = await readFile(outputPath);

      expect(new Uint8Array(writtenFile.buffer, writtenFile.byteOffset, writtenFile.byteLength))
        .toEqual(result.file);
      expect(result.inputPath).toBe(inputPath);
      expect(result.outputPath).toBe(outputPath);
      expect((await readdir(directory)).sort()).toEqual(['model.glb', 'model.veg']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects incorrect input and output extensions before writing', async () => {
    await expect(createVegFile({
      inputPath: 'model.gltf',
      outputPath: 'model.veg',
      config: createConfig(),
    })).rejects.toThrow('Input file must use the .glb extension.');
    await expect(createVegFile({
      inputPath: 'model.glb',
      outputPath: 'model.bin',
      config: createConfig(),
    })).rejects.toThrow('Output file must use the .veg extension.');
  });
});

function createConfig(): VegCompilerConfig {
  return {
    coordinateSystem: {
      space: 'model-local',
      upAxis: 'z',
      horizontalAxes: ['x', 'y'],
      unitsPerMeter: 1,
    },
    source: {
      format: 'glb',
      reader: 'three-gltf-loader',
      includeInvisibleObjects: false,
      heightSurfaceSelector: {
        any: [{
          type: 'mesh-name',
          values: ['surfice'],
          caseSensitive: false,
        }],
      },
    },
    extraction: {
      seed: { mode: 'manual', manualValue: 42 },
      grid: {
        strategy: 'fixed-world-size',
        chunkSize: 4,
        origin: { mode: 'snap-to-height-surface-bounds' },
        boundsSource: 'height-surfaces',
        includeEmptyChunks: false,
      },
      heightMap: {
        resolution: 3,
        samplePlacement: 'include-chunk-borders',
      },
      vegetationMask: {
        cellActivation: 'triangle-overlap',
        allowLayerOverlap: true,
      },
      vegetationLayers: [{
        id: 5,
        key: 'test-grass',
        displayName: 'Test grass',
        enabled: true,
        maskResolution: 4,
        surfaceSelector: {
          all: [
            {
              type: 'mesh-name',
              values: ['surfice'],
              caseSensitive: false,
            },
            {
              type: 'material-name',
              values: ['map_grun'],
              caseSensitive: false,
            },
          ],
        },
        filters: { maximumSlopeDegrees: 90 },
      }],
    },
    output: {
      format: 'veg',
      fileVersion: 1,
      byteOrder: 'little-endian',
      heightValueBits: 16,
    },
  };
}
