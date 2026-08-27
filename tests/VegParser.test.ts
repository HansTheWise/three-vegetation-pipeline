import { describe, expect, it } from 'vitest';
import type { VegetationDataset } from '../src/offline/extractor/types.js';
import { parseVegFile } from '../src/runtime/parser/VegParser.js';
import {
  VEG_HEADER_OFFSET,
  VEG_HEADER_SIZE,
  VEG_LAYER_METADATA_SIZE,
} from '../src/offline/writer/format.js';
import type { HeightValueBits } from '../src/offline/writer/types.js';
import { writeVegFile } from '../src/offline/writer/VegWriter.js';

const TEST_BUILD_FINGERPRINT = Uint8Array.from({ length: 16 }, (_, index) => index);

describe('parseVegFile', () => {
  it.each([
    [8, Uint8Array, [0, 85, 170, 255]],
    [16, Uint16Array, [0, 21_845, 43_690, 65_535]],
    [32, Uint32Array, [0, 1_431_655_765, 2_863_311_530, 4_294_967_295]],
  ] as const)(
    'parses a writer-produced multi-layer file with %i-bit heights',
    (heightValueBits, HeightArray, expectedHeights) => {
      const file = createFile(heightValueBits);
      const parsed = parseVegFile(file);

      expect(parsed.header).toEqual({
        version: 1,
        fileSize: file.byteLength,
        seed: 0xdead_beef,
        buildFingerprint: TEST_BUILD_FINGERPRINT,
        fileChecksum: dataView(file).getUint32(VEG_HEADER_OFFSET.fileChecksum, true),
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

  it('rejects invalid signatures, versions and truncated files', () => {
    const invalidMagic = createFile(16).slice();
    invalidMagic[0] = 0;
    const invalidVersion = createFile(16).slice();
    dataView(invalidVersion).setUint16(VEG_HEADER_OFFSET.version, 2, true);
    const truncated = createFile(16).subarray(0, createFile(16).byteLength - 1);

    expect(() => parseVegFile(invalidMagic)).toThrow('Invalid VEGFILE signature');
    expect(() => parseVegFile(invalidVersion)).toThrow('Unsupported .veg file version 2.');
    expect(() => parseVegFile(truncated)).toThrow('does not match the provided');
  });

  it('rejects inconsistent section offsets and layer lengths', () => {
    const invalidOffset = createFile(16).slice();
    dataView(invalidOffset).setUint32(
      VEG_HEADER_OFFSET.chunkLookup,
      VEG_HEADER_SIZE,
      true,
    );
    const invalidLayerLength = createFile(16).slice();
    dataView(invalidLayerLength).setUint32(
      VEG_HEADER_SIZE + 12,
      8,
      true,
    );

    expect(() => parseVegFile(invalidOffset)).toThrow('chunkLookup offset');
    expect(() => parseVegFile(invalidLayerLength)).toThrow('maskDataByteLength');
  });

  it('rejects invalid chunk lookup entries and height intervals', () => {
    const invalidLookup = createFile(16).slice();
    const lookupOffset = dataView(invalidLookup)
      .getUint32(VEG_HEADER_OFFSET.chunkLookup, true);
    dataView(invalidLookup).setInt32(lookupOffset, 4, true);

    const invalidHeightRange = createFile(16).slice();
    const metadataOffset = dataView(invalidHeightRange)
      .getUint32(VEG_HEADER_OFFSET.chunkMetadata, true);
    dataView(invalidHeightRange).setFloat32(metadataOffset, 4, true);

    expect(() => parseVegFile(invalidLookup))
      .toThrow('chunkLookup contains invalid stored index 4.');
    expect(() => parseVegFile(invalidHeightRange))
      .toThrow('stored chunk 0 has an invalid height interval.');
  });

  it('rejects set bits outside a layer mask resolution', () => {
    const invalid = createFile(16).slice();
    const secondLayerMetadata = VEG_HEADER_SIZE + VEG_LAYER_METADATA_SIZE;
    const maskOffset = dataView(invalid).getUint32(secondLayerMetadata + 8, true);
    dataView(invalid).setUint32(maskOffset, 0x8000_0001, true);

    expect(() => parseVegFile(invalid))
      .toThrow('layer 9 contains set padding bits in chunk 0.');
  });

  it('rejects content that no longer matches the stored checksum', () => {
    const invalid = createFile(16).slice();
    const heightOffset = dataView(invalid).getUint32(VEG_HEADER_OFFSET.heightData, true);
    invalid[heightOffset] = invalid[heightOffset]! ^ 1;

    expect(() => parseVegFile(invalid)).toThrow('does not match calculated');
  });
});

function createFile(heightValueBits: HeightValueBits): Uint8Array {
  return writeVegFile(
    createDataset(),
    {
      format: 'veg',
      fileVersion: 1,
      byteOrder: 'little-endian',
      heightValueBits,
    },
    { buildFingerprint: TEST_BUILD_FINGERPRINT },
  );
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
    chunkLookup: new Int32Array([0, -1]),
    chunks: [{
      gridX: 0,
      gridY: 0,
      minimumHeight: 0,
      maximumHeight: 3,
    }],
    heightData: new Float64Array([0, 1, 2, 3]),
  };
}
