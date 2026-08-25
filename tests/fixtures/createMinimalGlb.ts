/** Creates a static triangle GLB named "surfice" with material "map_grun". */
export function createMinimalGlb(): ArrayBuffer {
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'surfice', translation: [10, 20, 30] }],
    meshes: [{
      name: 'surfice',
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
    }],
    materials: [{ name: 'map_grun' }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ byteLength: 44 }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.length);
  const binaryLength = 44;
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const result = new ArrayBuffer(totalLength);
  const view = new DataView(result);
  const bytes = new Uint8Array(result);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(jsonBytes, 20);

  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  const binaryStart = binaryHeader + 8;
  const positions = new Float32Array(result, binaryStart, 9);
  positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array(result, binaryStart + 36, 3);
  indices.set([0, 1, 2]);
  return result;
}
function align4(value: number): number {
  return Math.ceil(value / 4) * 4;
}
