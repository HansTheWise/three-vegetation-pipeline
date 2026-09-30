import { describe, expect, it } from 'vitest';
import type { VegetationDataset } from '../src/pre-runtime-compiler-core/vegetation-dataset-extraction/VegetationExtractionTypes.js';
import type { HeightValueBits, VegFileEncodingConfig } from '../src/pre-runtime-compiler-core/veg-file-writing/VegFileWriterTypes.js';
import { writeVegFile } from '../src/pre-runtime-compiler-core/veg-file-writing/VegFileWriter.js';
import { calculateVegFileV2ByteLayout } from '../src/shared/vegfile-format/VegFileV2ByteLayout.js';
import {
  calculateVegFileChecksum,
  VEG_FILE_HEADER_OFFSETS,
} from '../src/shared/vegfile-format/VegFileV2Schema.js';

const TEST_BUILD_FINGERPRINT = Uint8Array.from({ length: 16 }, (_, index) => index);

describe('writeVegFile', () => {
  it('writes the VEGFILE v2 header and schema-derived sections', () => {
    const file = writeVegFile(createDataset(), createWriterConfig(16), createFileMetadata());
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const layout = createLayout(16);

    expect(String.fromCharCode(...file.subarray(0, 8))).toBe('VEGFILE\0');
    expect(view.getUint16(VEG_FILE_HEADER_OFFSETS.version, true)).toBe(2);
    expect(view.getUint32(VEG_FILE_HEADER_OFFSETS.gridWidth, true)).toBe(1);
    expect(view.getUint32(VEG_FILE_HEADER_OFFSETS.gridHeight, true)).toBe(1);
    expect(view.getUint32(VEG_FILE_HEADER_OFFSETS.storedChunkCount, true)).toBe(1);
    expect(view.getUint32(VEG_FILE_HEADER_OFFSETS.layerCount, true)).toBe(2);
    expect(view.getUint32(VEG_FILE_HEADER_OFFSETS.seed, true)).toBe(0xdead_beef);
    expect(view.getUint8(VEG_FILE_HEADER_OFFSETS.upAxis)).toBe(2);
    expect(view.getUint8(VEG_FILE_HEADER_OFFSETS.horizontalAxisX)).toBe(0);
    expect(view.getUint8(VEG_FILE_HEADER_OFFSETS.horizontalAxisY)).toBe(1);
    expect(view.getUint8(VEG_FILE_HEADER_OFFSETS.heightValueBits)).toBe(16);
    expect(view.getUint16(VEG_FILE_HEADER_OFFSETS.heightMapResolutionPerChunkAxis, true)).toBe(2);
    expect([
      ...file.subarray(
        VEG_FILE_HEADER_OFFSETS.buildFingerprint,
        VEG_FILE_HEADER_OFFSETS.fileChecksum,
      ),
    ]).toEqual([...TEST_BUILD_FINGERPRINT]);
    expect(view.getUint32(VEG_FILE_HEADER_OFFSETS.fileChecksum, true))
      .toBe(calculateVegFileChecksum(file));
    expect(file).toHaveLength(layout.fileByteLength);

    expect(readLayerMetadata(view, layout.layers[0]!.metadataOffset)).toEqual({
      vegetationLayerId: 7,
      maskResolutionPerChunkAxis: 2,
      padding: 0,
    });
    expect(readLayerMetadata(view, layout.layers[1]!.metadataOffset)).toEqual({
      vegetationLayerId: 9,
      maskResolutionPerChunkAxis: 1,
      padding: 0,
    });
    expect(view.getInt32(layout.chunkLookupOffset, true)).toBe(0);
    expect(view.getFloat32(layout.chunkHeightRangesOffset, true)).toBe(0);
    expect(view.getFloat32(layout.chunkHeightRangesOffset + 4, true)).toBe(3);
    expect([0, 2, 4, 6].map((offset) => (
      view.getUint16(layout.heightDataOffset + offset, true)
    ))).toEqual([0, 21_845, 43_690, 65_535]);
    expect(view.getUint32(layout.layers[0]!.maskDataOffset, true)).toBe(0b1101);
    expect(view.getUint32(layout.layers[1]!.maskDataOffset, true)).toBe(0b1);
  });

  it.each([
    [8, [0, 85, 170, 255], 128, 136],
    [16, [0, 21_845, 43_690, 65_535], 132, 140],
    [32, [0, 1_431_655_765, 2_863_311_530, 4_294_967_295], 140, 148],
  ] as const)(
    'quantizes height samples with %i bits',
    (bits, expected, expectedMaskOffset, expectedFileSize) => {
      const file = writeVegFile(createDataset(), createWriterConfig(bits), createFileMetadata());
      const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
      const layout = createLayout(bits);
      const readValue = bits === 8
        ? (offset: number): number => view.getUint8(offset)
        : bits === 16
          ? (offset: number): number => view.getUint16(offset, true)
          : (offset: number): number => view.getUint32(offset, true);

      expect(expected.map((_, index) => (
        readValue(layout.heightDataOffset + index * (bits / 8))
      ))).toEqual([...expected]);
      expect(layout.vegetationMaskDataOffset).toBe(expectedMaskOffset);
      expect(file).toHaveLength(expectedFileSize);
    },
  );

  it('produces identical bytes for identical datasets and writer config', () => {
    const first = writeVegFile(createDataset(), createWriterConfig(16), createFileMetadata());
    const second = writeVegFile(createDataset(), createWriterConfig(16), createFileMetadata());
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

    expect(() => writeVegFile(invalidValue, createWriterConfig(16), createFileMetadata()))
      .toThrow('maskData may contain only 0 or 1');
    expect(() => writeVegFile(invalidLength, createWriterConfig(16), createFileMetadata()))
      .toThrow('maskData length is invalid');
  });

  it('requires a 16-byte build fingerprint', () => {
    expect(() => writeVegFile(
      createDataset(),
      createWriterConfig(16),
      { buildFingerprint: new Uint8Array(15) },
    )).toThrow('buildFingerprint must contain exactly 16 bytes.');
  });
});

function createLayout(heightValueBits: HeightValueBits) {
  return calculateVegFileV2ByteLayout({
    gridWidth: 1,
    gridHeight: 1,
    storedChunkCount: 1,
    heightMapResolutionPerChunkAxis: 2,
    heightValueBits,
    layerMaskResolutionsPerChunkAxis: [2, 1],
  });
}

function readLayerMetadata(view: DataView, byteOffset: number) {
  return {
    vegetationLayerId: view.getUint32(byteOffset, true),
    maskResolutionPerChunkAxis: view.getUint16(byteOffset + 4, true),
    padding: view.getUint16(byteOffset + 6, true),
  };
}

function createWriterConfig(heightValueBits: HeightValueBits): VegFileEncodingConfig {
  return { heightValueBits };
}

function createFileMetadata() {
  return { buildFingerprint: TEST_BUILD_FINGERPRINT };
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
    vegetationSeed: 0xdead_beef,
    grid: {
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
      chunkSize: 4,
    },
    heightMap: { resolutionPerChunkAxis: 2 },
    layers: [
      {
        vegetationLayerId: 7,
        vegetationLayerKey: 'grass',
        maskResolutionPerChunkAxis: 2,
        maskData: new Uint8Array([1, 0, 1, 1]),
      },
      {
        vegetationLayerId: 9,
        vegetationLayerKey: 'flowers',
        maskResolutionPerChunkAxis: 1,
        maskData: new Uint8Array([1]),
      },
    ],
    chunkLookup: new Int32Array([0]),
    storedChunkHeightRanges: [{ minimumHeight: 0, maximumHeight: 3 }],
    heightData: new Float64Array([0, 1, 2, 3]),
  };
}
