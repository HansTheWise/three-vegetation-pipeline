import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { icakaVegetationConfig } from '../config/icaka.vegetation.config.js';
import { compileGlbToVeg } from '../src/compiler/VegCompiler.js';
import { VEG_HEADER_OFFSET } from '../src/writer/format.js';

const fallbackCampusPath = resolve(
  process.cwd(),
  '..',
  'Interaktive-2.5D-Campus-Karte-Projekt-I-CAKA-',
  'storage',
  'models',
  'production',
  'campus',
  'campus.glb',
);
const campusPath = process.env.ICAKA_CAMPUS_GLB ?? fallbackCampusPath;

describe.runIf(existsSync(campusPath))('I-CAKA campus extraction', () => {
  it('extracts a structurally valid multi-layer-ready dataset from campus.glb', async () => {
    const file = await readFile(campusPath);
    const arrayBuffer = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
    const compilation = await compileGlbToVeg(
      arrayBuffer,
      {
        ...icakaVegetationConfig,
        extraction: {
          ...icakaVegetationConfig.extraction,
          seed: { mode: 'manual', manualValue: 0 },
        },
      },
    );
    const { dataset, file: vegFile, report } = compilation;

    expect(report.sourceMeshCount).toBe(76);
    expect(report.triangleCount).toBe(287_731);
    expect(dataset.layers.map((layer) => layer.key)).toEqual(['campus-grass']);
    expect(dataset.layers[0]!.activeCellCount).toBeGreaterThan(0);
    expect(dataset.chunks.length).toBeGreaterThan(0);
    expect(dataset.heightData.length).toBe(
      dataset.chunks.length * dataset.heightMap.resolution ** 2,
    );
    expect(dataset.layers.every((layer) => (
      layer.maskData.length
      === dataset.chunks.length * layer.maskResolution ** 2
    ))).toBe(true);
    expect([...dataset.chunkLookup].every((value) => (
      value === -1 || (value >= 0 && value < dataset.chunks.length)
    ))).toBe(true);
    expect(dataset.chunks.every((chunk) => (
      Number.isFinite(chunk.minimumHeight)
      && Number.isFinite(chunk.maximumHeight)
      && chunk.minimumHeight <= chunk.maximumHeight
    ))).toBe(true);

    const view = new DataView(
      vegFile.buffer,
      vegFile.byteOffset,
      vegFile.byteLength,
    );
    expect(String.fromCharCode(...vegFile.subarray(0, 8))).toBe('VEGFILE\0');
    expect(view.getUint32(VEG_HEADER_OFFSET.fileSize, true)).toBe(vegFile.byteLength);
    expect(view.getUint32(VEG_HEADER_OFFSET.storedChunkCount, true))
      .toBe(dataset.chunks.length);
    expect(view.getUint32(VEG_HEADER_OFFSET.layerCount, true)).toBe(1);
    expect(report.fileByteLength).toBe(vegFile.byteLength);
    const layerMetadataOffset = view.getUint32(VEG_HEADER_OFFSET.layerMetadata, true);
    expect(view.getUint32(layerMetadataOffset, true)).toBe(0);
    expect(view.getUint16(layerMetadataOffset + 4, true)).toBe(128);
  }, 60_000);
});
