import { describe, expect, it } from 'vitest';
import type { VegetationDataset } from '../src/extractor/types.js';
import {
  VEG_HEADER_OFFSET,
  VEG_HEADER_SIZE,
  VEG_LAYER_METADATA_SIZE,
} from '../src/writer/format.js';
import type { HeightValueBits, VegWriterConfig } from '../src/writer/types.js';
import { writeVegFile } from '../src/writer/VegWriter.js';

describe('writeVegFile', () => {
  it('writes the VEGFILE v1 header, sections and differently sized layer masks', () => {
    const file = writeVegFile(createDataset(), createWriterConfig(16));
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);

    expect(String.fromCharCode(...file.subarray(0, 8))).toBe('VEGFILE\0');
    expect(view.getUint16(VEG_HEADER_OFFSET.version, true)).toBe(1);
    expect(view.getUint16(VEG_HEADER_OFFSET.headerSize, true)).toBe(VEG_HEADER_SIZE);
    expect(view.getUint32(VEG_HEADER_OFFSET.fileSize, true)).toBe(188);
    expect(view.getUint32(VEG_HEADER_OFFSET.gridWidth, true)).toBe(1);
    expect(view.getUint32(VEG_HEADER_OFFSET.gridHeight, true)).toBe(1);
    expect(view.getUint32(VEG_HEADER_OFFSET.storedChunkCount, true)).toBe(1);
    expect(view.getUint32(VEG_HEADER_OFFSET.layerCount, true)).toBe(2);
    expect(view.getUint32(VEG_HEADER_OFFSET.seed, true)).toBe(0xdead_beef);
    expect(view.getUint8(VEG_HEADER_OFFSET.upAxis)).toBe(2);
    expect(view.getUint8(VEG_HEADER_OFFSET.horizontalAxisX)).toBe(0);
    expect(view.getUint8(VEG_HEADER_OFFSET.horizontalAxisY)).toBe(1);
    expect(view.getUint8(VEG_HEADER_OFFSET.heightValueBits)).toBe(16);
    expect(view.getUint16(VEG_HEADER_OFFSET.heightResolution, true)).toBe(2);

    expect(view.getUint32(VEG_HEADER_OFFSET.layerMetadata, true)).toBe(128);
    expect(view.getUint32(VEG_HEADER_OFFSET.chunkLookup, true)).toBe(160);
    expect(view.getUint32(VEG_HEADER_OFFSET.chunkMetadata, true)).toBe(164);
    expect(view.getUint32(VEG_HEADER_OFFSET.heightData, true)).toBe(172);
    expect(view.getUint32(VEG_HEADER_OFFSET.vegetationMaskData, true)).toBe(180);

    expect(readLayerMetadata(view, 0)).toEqual({
      id: 7,
      resolution: 2,
      maskOffset: 180,
      maskByteLength: 4,
    });
    expect(readLayerMetadata(view, 1)).toEqual({
      id: 9,
      resolution: 1,
      maskOffset: 184,
      maskByteLength: 4,
    });

    expect(view.getInt32(160, true)).toBe(0);
    expect(view.getFloat32(164, true)).toBe(0);
    expect(view.getFloat32(168, true)).toBe(3);
    expect([0, 2, 4, 6].map((offset) => view.getUint16(172 + offset, true)))
      .toEqual([0, 21_845, 43_690, 65_535]);
    expect(view.getUint32(180, true)).toBe(0b1101);
    expect(view.getUint32(184, true)).toBe(0b1);
  });

  it.each([
    [8, [0, 85, 170, 255], 176, 184],
    [16, [0, 21_845, 43_690, 65_535], 180, 188],
    [32, [0, 1_431_655_765, 2_863_311_530, 4_294_967_295], 188, 196],
  ] as const)(
    'quantizes height samples with %i bits',
    (bits, expected, expectedMaskOffset, expectedFileSize) => {
      const file = writeVegFile(createDataset(), createWriterConfig(bits));
      const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
      const heightOffset = view.getUint32(VEG_HEADER_OFFSET.heightData, true);
      const readValue = bits === 8
        ? (offset: number): number => view.getUint8(offset)
        : bits === 16
          ? (offset: number): number => view.getUint16(offset, true)
          : (offset: number): number => view.getUint32(offset, true);

      expect(expected.map((_, index) => readValue(heightOffset + index * (bits / 8))))
        .toEqual([...expected]);
      expect(view.getUint32(VEG_HEADER_OFFSET.vegetationMaskData, true))
        .toBe(expectedMaskOffset);
      expect(file).toHaveLength(expectedFileSize);
    },
  );

  it('produces identical bytes for identical datasets and writer config', () => {
    const first = writeVegFile(createDataset(), createWriterConfig(16));
    const second = writeVegFile(createDataset(), createWriterConfig(16));

    expect(second).toEqual(first);
  });

  it('rejects invalid logical mask values and inconsistent mask lengths', () => {
    const dataset = createDataset();
    const invalidValue = {
      ...dataset,
      layers: [{
        ...dataset.layers[0]!,
        maskData: new Uint8Array([2, 0, 1, 1]),
      }, dataset.layers[1]!],
    } satisfies VegetationDataset;
    const invalidLength = {
      ...dataset,
      layers: [{
        ...dataset.layers[0]!,
        maskData: new Uint8Array([1]),
      }, dataset.layers[1]!],
    } satisfies VegetationDataset;

    expect(() => writeVegFile(invalidValue, createWriterConfig(16)))
      .toThrow('maskData may contain only 0 or 1');
    expect(() => writeVegFile(invalidLength, createWriterConfig(16)))
      .toThrow('maskData length is invalid');
  });
});

function readLayerMetadata(view: DataView, layerIndex: number) {
  const offset = VEG_HEADER_SIZE + layerIndex * VEG_LAYER_METADATA_SIZE;
  return {
    id: view.getUint32(offset, true),
    resolution: view.getUint16(offset + 4, true),
    maskOffset: view.getUint32(offset + 8, true),
    maskByteLength: view.getUint32(offset + 12, true),
  };
}
function createWriterConfig(heightValueBits: HeightValueBits): VegWriterConfig {
  return {
    format: 'veg',
    fileVersion: 1,
    byteOrder: 'little-endian',
    heightValueBits,
  };
}

function createDataset(): VegetationDataset {
  return {
    sourceBounds: {
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 4,
      maxY: 4,
      maxZ: 3,
    },
    coordinateSystem: {
      upAxis: 'z',
      horizontalAxes: ['x', 'y'],
      unitsPerMeter: 1,
    },
    seed: 0xdead_beef,
    grid: {
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
      chunkSize: 4,
    },
    heightMap: { resolution: 2 },
    layers: [
      {
        id: 7,
        key: 'grass',
        displayName: 'Grass',
        maskResolution: 2,
        activeCellCount: 3,
        maskData: new Uint8Array([1, 0, 1, 1]),
      },
      {
        id: 9,
        key: 'flowers',
        displayName: 'Flowers',
        maskResolution: 1,
        activeCellCount: 1,
        maskData: new Uint8Array([1]),
      },
    ],
    chunkLookup: new Int32Array([0]),
    chunks: [{
      gridX: 0,
      gridY: 0,
      minimumHeight: 0,
      maximumHeight: 3,
    }],
    heightData: new Float64Array([0, 1, 2, 3]),
  };
}
