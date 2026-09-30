import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compileGlbToVegFile,
  evaluateVegFileBuildStatus,
  type VegetationCompilerConfig,
} from '../src/pre-runtime-compiler-core/index.js';
import {
  checkVegFileBuildStatus,
  generateNodeVegFile,
} from '../src/node-pre-runtime-compiler-integration/index.js';
import { parseVegFile } from '../src/shared/vegfile-parsing/VegParser.js';
import { createMinimalGlb } from './fixtures/createMinimalGlb.js';

describe('GLB to VEGFILE compiler', () => {
  it('runs reading, extraction and VEGFILE encoding as one deterministic pipeline', async () => {
    const result = await compileGlbToVegFile(
      createMinimalGlb(),
      createConfig(),
    );

    expect(String.fromCharCode(...result.vegFileBytes.subarray(0, 8))).toBe('VEGFILE\0');
    expect(result).not.toHaveProperty('vegetationDataset');
    expect(result).not.toHaveProperty('compilationStatistics');
    expect(result.buildFingerprint).toHaveLength(16);
  });

  it('uses seed 0 by default and includes the resolved config in deterministic output', async () => {
    const glbArrayBuffer = createMinimalGlb();
    const config = createConfig();
    const first = await compileGlbToVegFile(glbArrayBuffer, config);
    const second = await compileGlbToVegFile(glbArrayBuffer, config);
    const { vegetationSeed: _omittedSeed, ...extractionWithoutSeed } = config.extraction;
    const omittedSeedConfig = { ...config, extraction: extractionWithoutSeed };
    const explicitZeroConfig = {
      ...omittedSeedConfig,
      extraction: { ...extractionWithoutSeed, vegetationSeed: 0 },
    };
    const omittedSeed = await compileGlbToVegFile(glbArrayBuffer, omittedSeedConfig);
    const explicitZeroSeed = await compileGlbToVegFile(glbArrayBuffer, explicitZeroConfig);
    const changedEncoding = await compileGlbToVegFile(glbArrayBuffer, {
      ...config,
      vegFileEncoding: { heightValueBits: 8 },
    });

    expect(second.buildFingerprint).toEqual(first.buildFingerprint);
    expect(second.vegFileBytes).toEqual(first.vegFileBytes);
    expect(parseVegFile(omittedSeed.vegFileBytes).header.vegetationSeed).toBe(0);
    expect(omittedSeed.buildFingerprint).toEqual(explicitZeroSeed.buildFingerprint);
    expect(omittedSeed.vegFileBytes).toEqual(explicitZeroSeed.vegFileBytes);
    expect(changedEncoding.buildFingerprint).not.toEqual(first.buildFingerprint);
  });

  it('validates the complete compiler config before reading the GLB', async () => {
    const invalidConfig = {
      ...createConfig(),
      extraction: { ...createConfig().extraction, vegetationSeed: -1 },
    };

    await expect(compileGlbToVegFile(
      new ArrayBuffer(0),
      invalidConfig,
    ))
      .rejects.toThrow('extraction.vegetationSeed must be an unsigned 32-bit integer.');
  });

  it('evaluates all build states inside the compiler core from loaded bytes', async () => {
    const glbArrayBuffer = createMinimalGlb();
    const vegetationCompilerConfig = createConfig();
    const compilationResult = await compileGlbToVegFile(
      glbArrayBuffer,
      vegetationCompilerConfig,
    );

    expect(await evaluateVegFileBuildStatus({
      glbArrayBuffer,
      vegetationCompilerConfig,
      existingVegFileBytes: null,
    })).toMatchObject({ status: 'missing' });
    expect(await evaluateVegFileBuildStatus({
      glbArrayBuffer,
      vegetationCompilerConfig,
      existingVegFileBytes: compilationResult.vegFileBytes,
    })).toMatchObject({
      status: 'up-to-date',
      actualBuildFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(await evaluateVegFileBuildStatus({
      glbArrayBuffer,
      vegetationCompilerConfig: {
        ...vegetationCompilerConfig,
        extraction: {
          ...vegetationCompilerConfig.extraction,
          vegetationSeed: 43,
        },
      },
      existingVegFileBytes: compilationResult.vegFileBytes,
    })).toMatchObject({ status: 'outdated' });
    expect(await evaluateVegFileBuildStatus({
      glbArrayBuffer,
      vegetationCompilerConfig,
      existingVegFileBytes: new TextEncoder().encode('not-a-veg-file'),
    })).toMatchObject({
      status: 'invalid',
      validationError: expect.any(String),
    });
  });

  it('atomically replaces a requested VEGFILE and leaves no temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vegetation-compiler-'));
    const sourceGlbFilePath = join(directory, 'model.glb');
    const outputVegFilePath = join(directory, 'model.veg');
    try {
      await writeFile(sourceGlbFilePath, new Uint8Array(createMinimalGlb()));
      await writeFile(outputVegFilePath, 'old-file');

      const result = await generateNodeVegFile({
        sourceGlbFilePath,
        outputVegFilePath,
        vegetationCompilerConfig: createConfig(),
      });
      const writtenVegFile = await readFile(outputVegFilePath);

      expect(new Uint8Array(
        writtenVegFile.buffer,
        writtenVegFile.byteOffset,
        writtenVegFile.byteLength,
      )).toEqual(result.vegFileBytes);
      expect(result.sourceGlbFilePath).toBe(sourceGlbFilePath);
      expect(result.outputVegFilePath).toBe(outputVegFilePath);
      expect((await readdir(directory)).sort()).toEqual(['model.glb', 'model.veg']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects incorrect input and output extensions before writing', async () => {
    await expect(generateNodeVegFile({
      sourceGlbFilePath: 'model.gltf',
      outputVegFilePath: 'model.veg',
      vegetationCompilerConfig: createConfig(),
    })).rejects.toThrow('Source GLB file must use the .glb extension.');
    await expect(generateNodeVegFile({
      sourceGlbFilePath: 'model.glb',
      outputVegFilePath: 'model.bin',
      vegetationCompilerConfig: createConfig(),
    })).rejects.toThrow('Output VEGFILE must use the .veg extension.');
  });

  it('reports missing, up-to-date, outdated and invalid VEGFILE states', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vegetation-build-status-'));
    const sourceGlbFilePath = join(directory, 'model.glb');
    const outputVegFilePath = join(directory, 'model.veg');
    const options = {
      sourceGlbFilePath,
      outputVegFilePath,
      vegetationCompilerConfig: createConfig(),
    };
    try {
      await writeFile(sourceGlbFilePath, new Uint8Array(createMinimalGlb()));
      expect(await checkVegFileBuildStatus(options)).toMatchObject({ status: 'missing' });

      await generateNodeVegFile(options);
      expect(await checkVegFileBuildStatus(options)).toMatchObject({
        status: 'up-to-date',
        actualBuildFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/),
      });

      expect(await checkVegFileBuildStatus({
        ...options,
        vegetationCompilerConfig: {
          ...options.vegetationCompilerConfig,
          extraction: {
            ...options.vegetationCompilerConfig.extraction,
            vegetationSeed: 43,
          },
        },
      })).toMatchObject({ status: 'outdated' });

      await writeFile(outputVegFilePath, 'not-a-veg-file');
      expect(await checkVegFileBuildStatus(options)).toMatchObject({
        status: 'invalid',
        validationError: expect.any(String),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function createConfig(): VegetationCompilerConfig {
  return {
    glbModelReading: {
      includeInvisibleObjects: false,
    },
    extraction: {
      coordinateSystem: {
        upAxis: 'z',
        horizontalAxes: ['x', 'y'],
        unitsPerMeter: 1,
      },
      vegetationSeed: 42,
      grid: {
        chunkSize: 4,
      },
      heightMap: {
        resolutionPerChunkAxis: 3,
        sourceSurfaceSelection: {
          matchAny: [{
            property: 'hierarchyNodeName',
            acceptedNames: ['terrain'],
            caseSensitive: false,
          }],
        },
      },
      allowVegetationLayerOverlap: true,
      vegetationLayers: [{
        vegetationLayerId: 5,
        vegetationLayerKey: 'test-grass',
        maskResolutionPerChunkAxis: 4,
        includedSurfaceSelection: {
          matchAll: [
            {
              property: 'hierarchyNodeName',
              acceptedNames: ['terrain'],
              caseSensitive: false,
            },
            {
              property: 'materialName',
              acceptedNames: ['meadow'],
              caseSensitive: false,
            },
          ],
        },
        filters: { maximumSlopeDegrees: 90 },
      }],
    },
    vegFileEncoding: {
      heightValueBits: 16,
    },
  };
}
