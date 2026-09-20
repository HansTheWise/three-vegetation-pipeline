import { describe, expect, it } from 'vitest';
import type { VegetationDataset } from '../src/offline/vegetation-dataset-extraction/VegetationExtractionTypes.js';
import { writeVegFile } from '../src/offline/vegfile-v2-serialization/VegWriter.js';
import { parseVegFile } from '../src/runtime/vegfile-v2-parsing/VegParser.js';
import { calculateVegFileV2Layout } from '../src/vegfile-v2-format/VegFileV2Layout.js';
import {
  VEG_FILE_HEADER_OFFSETS,
  VEG_FILE_HEADER_SIZE,
  VEG_FILE_LAYER_METADATA_SIZE,
} from '../src/vegfile-v2-format/VegFileV2Schema.js';
import type { HeightValueBits } from '../src/vegfile-v2-format/VegetationFileTypes.js';

const TEST_BUILD_FINGERPRINT = Uint8Array.from({ length: 16 }, (_, index) => index);

describe('parseVegFile', () => {
  it.each([
    [8, Uint8Array, [0, 85, 170, 255]],
    [16, Uint16Array, [0, 21_845, 43_690, 65_535]],
    [32, Uint32Array, [0, 1_431_655_765, 2_863_311_530, 4_294_967_295]],
  ] as const)(
    'parses a writer-produced multi-layer v2 file with %i-bit heights',
    (heightValueBits, HeightArray, expectedHeights) => {
      const file = createFile(heightValueBits);
      const parsed = parseVegFile(file);

      expect(parsed.header).toEqual({
        version: 2,
        seed: 0xdead_beef,
        buildFingerprint: TEST_BUILD_FINGERPRINT,
        fileChecksum: dataView(file).getUint32(
          VEG_FILE_HEADER_OFFSETS.fileChecksum,
          true,
        ),
        sourceBounds: {
          minX: 0,
          minY: 0,
          minZ: 0,
          maxX: 8,
          maxY: 4,
          maxZ: 3,
        },
        coordinateSystem: {
          upAxis: 'z',
          horizontalAxes: ['x', 'y'],
          unitsPerMeter: 1,
        },
        grid: {
          width: 2,
          height: 1,
          chunkSize: 4,
          originX: 0,
          originY: 0,
        },
        storedChunkCount: 1,
        heightMap: {
          resolution: 2,
          valueBits: heightValueBits,
          valuesPerChunk: 4,
        },
      });
      expect(parsed.chunkLookup).toBeInstanceOf(Int32Array);
      expect([...parsed.chunkLookup]).toEqual([0, -1]);
      expect([...parsed.chunkHeightRanges]).toEqual([0, 3]);
      expect(parsed.heightData).toBeInstanceOf(HeightArray);
      expect([...parsed.heightData]).toEqual([...expectedHeights]);
      expect(parsed.layers.map((layer) => ({
        id: layer.id,
        maskResolution: layer.maskResolution,
        maskWordsPerChunk: layer.maskWordsPerChunk,
        maskData: [...layer.maskData],
      }))).toEqual([
        { id: 7, maskResolution: 2, maskWordsPerChunk: 1, maskData: [0b1101] },
        { id: 9, maskResolution: 1, maskWordsPerChunk: 1, maskData: [0b1] },
      ]);

      expect(parsed.bytes.buffer).toBe(file.buffer);
      expect(parsed.chunkLookup.buffer).toBe(file.buffer);
      expect(parsed.heightData.buffer).toBe(file.buffer);
      expect(parsed.layers[0]!.maskData.buffer).toBe(file.buffer);
    },
  );

  it('accepts an unaligned Uint8Array slice by creating one aligned allocation', () => {
    const file = createFile(16);
    const padded = new Uint8Array(file.byteLength + 1);
    padded.set(file, 1);
    const parsed = parseVegFile(padded.subarray(1));

    expect(parsed.bytes.byteOffset).toBe(0);
    expect(parsed.bytes).toEqual(file);
    expect([...parsed.chunkLookup]).toEqual([0, -1]);
  });

  it('rejects invalid signatures, v1 files and truncated files', () => {
    const invalidMagic = createFile(16).slice();
    invalidMagic[0] = 0;
    const versionOne = createFile(16).slice();
    dataView(versionOne).setUint16(VEG_FILE_HEADER_OFFSETS.version, 1, true);
    const completeFile = createFile(16);
    const truncated = completeFile.subarray(0, completeFile.byteLength - 1);

    expect(() => parseVegFile(invalidMagic)).toThrow('Invalid VEGFILE signature');
    expect(() => parseVegFile(versionOne)).toThrow('expected version 2');
    expect(() => parseVegFile(truncated)).toThrow('byte length');
  });

  it('rejects unexpected file lengths and nonzero layer padding', () => {
    const file = createFile(16);
    const extended = new Uint8Array(file.byteLength + 4);
    extended.set(file);
    const invalidPadding = file.slice();
    dataView(invalidPadding).setUint16(VEG_FILE_HEADER_SIZE + 6, 1, true);

    expect(() => parseVegFile(extended)).toThrow('byte length');
    expect(() => parseVegFile(invalidPadding)).toThrow('metadata padding must be zero');
  });

  it('rejects invalid chunk lookup entries and height intervals', () => {
    const layout = createLayout(16);
    const invalidLookup = createFile(16).slice();
    dataView(invalidLookup).setInt32(layout.chunkLookupOffset, 4, true);
    const invalidHeightRange = createFile(16).slice();
    dataView(invalidHeightRange).setFloat32(
      layout.chunkHeightRangesOffset,
      4,
      true,
    );

    expect(() => parseVegFile(invalidLookup))
      .toThrow('chunkLookup contains invalid stored index 4.');
    expect(() => parseVegFile(invalidHeightRange))
      .toThrow('stored chunk 0 has an invalid height interval.');
  });

  it('rejects set bits outside a layer mask resolution', () => {
    const invalid = createFile(16).slice();
    const layout = createLayout(16);
    dataView(invalid).setUint32(layout.layers[1]!.maskDataOffset, 0x8000_0001, true);

    expect(() => parseVegFile(invalid))
      .toThrow('layer 9 contains set padding bits in chunk 0.');
  });

  it('rejects content that no longer matches the stored checksum', () => {
    const invalid = createFile(16).slice();
    const heightOffset = createLayout(16).heightDataOffset;
    invalid[heightOffset] = invalid[heightOffset]! ^ 1;

    expect(() => parseVegFile(invalid)).toThrow('does not match calculated');
  });

  it('uses compact eight-byte layer metadata', () => {
    expect(VEG_FILE_LAYER_METADATA_SIZE).toBe(8);
  });
});

function createFile(heightValueBits: HeightValueBits): Uint8Array {
  return writeVegFile(
    createDataset(),
    { heightValueBits },
    { buildFingerprint: TEST_BUILD_FINGERPRINT },
  );
}

function createLayout(heightValueBits: HeightValueBits) {
  return calculateVegFileV2Layout({
    gridWidth: 2,
    gridHeight: 1,
    storedChunkCount: 1,
    heightResolution: 2,
    heightValueBits,
    layerMaskResolutions: [2, 1],
  });
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function createDataset(): VegetationDataset {
  return {
    sourceBounds: {
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 8,
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
      width: 2,
      height: 1,
      chunkSize: 4,
    },
    heightMap: { resolution: 2 },
    layers: [
      {
        id: 7,
        key: 'grass',
        maskResolution: 2,
        maskData: new Uint8Array([1, 0, 1, 1]),
      },
      {
        id: 9,
        key: 'flowers',
        maskResolution: 1,
        maskData: new Uint8Array([1]),
      },
    ],
    chunkLookup: new Int32Array([0, -1]),
    storedChunkHeightRanges: [{ minimumHeight: 0, maximumHeight: 3 }],
    heightData: new Float64Array([0, 1, 2, 3]),
  };
}
