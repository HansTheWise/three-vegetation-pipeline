export type WebGLDataTextureArray =
  Uint8Array | Uint16Array | Uint32Array | Float32Array;

export type WebGLDataTextureLayout = Readonly<{
  width: number;
  height: number;
  texelCapacity: number;
}>;

/** Packs a linear texel sequence across as many rows as the GPU requires. */
export function calculateWebGLDataTextureLayout(
  texelCount: number,
  maximumTextureSize: number,
  textureName: string,
): WebGLDataTextureLayout {
  if (!Number.isSafeInteger(texelCount) || texelCount < 1) {
    throw new Error(`${textureName} texture requires at least one texel.`);
  }
  const width = Math.min(texelCount, maximumTextureSize);
  const height = Math.ceil(texelCount / width);
  if (height > maximumTextureSize) {
    throw new Error(
      `${textureName} requires ${texelCount} texels, exceeding the WebGL capacity of ${maximumTextureSize}x${maximumTextureSize}.`,
    );
  }
  return { width, height, texelCapacity: width * height };
}

/** Adds only the zero padding required by the final partially filled texture row. */
export function padWebGLDataTextureArray(
  data: WebGLDataTextureArray,
  requiredValueCount: number,
): WebGLDataTextureArray {
  if (data.length === requiredValueCount) return data;
  let paddedData: WebGLDataTextureArray;
  if (data instanceof Uint8Array) paddedData = new Uint8Array(requiredValueCount);
  else if (data instanceof Uint16Array) paddedData = new Uint16Array(requiredValueCount);
  else if (data instanceof Uint32Array) paddedData = new Uint32Array(requiredValueCount);
  else paddedData = new Float32Array(requiredValueCount);
  paddedData.set(data);
  return paddedData;
}
