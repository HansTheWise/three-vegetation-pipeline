import type { VegetationDataset } from '../vegetation-dataset-extraction/VegetationExtractionTypes.js';

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffff_ffff;

/** Validates the complete neutral dataset before it is encoded as VEGFILE v2. */
export function validateVegetationDataset(dataset: VegetationDataset): void {
  validateUint32('vegetationSeed', dataset.vegetationSeed);
  validateUint32('grid.width', dataset.grid.width, 1);
  validateUint32('grid.height', dataset.grid.height, 1);
  validateFinitePositive('grid.chunkSize', dataset.grid.chunkSize);
  validateFinite('grid.originX', dataset.grid.originX);
  validateFinite('grid.originY', dataset.grid.originY);
  validateFinitePositive(
    'coordinateSystem.unitsPerMeter',
    dataset.coordinateSystem.unitsPerMeter,
  );
  const axes = [dataset.coordinateSystem.upAxis, ...dataset.coordinateSystem.horizontalAxes];
  if (new Set(axes).size !== 3) {
    throw new Error('Dataset coordinate axes must be unique.');
  }
  validateSourceBounds(dataset.sourceBounds);

  validateUint16(
    'heightMap.resolutionPerChunkAxis',
    dataset.heightMap.resolutionPerChunkAxis,
    2,
  );
  const storedChunkCount = dataset.storedChunkHeightRanges.length;
  validateUint32('storedChunkCount', storedChunkCount, 1);
  validateUint32('layerCount', dataset.layers.length, 1);
  validateChunkLookup(dataset, storedChunkCount);
  validateHeightData(dataset, storedChunkCount);
  validateLayers(dataset, storedChunkCount);
}

function validateSourceBounds(bounds: VegetationDataset['sourceBounds']): void {
  const boundValues = [
    bounds.minX,
    bounds.minY,
    bounds.minZ,
    bounds.maxX,
    bounds.maxY,
    bounds.maxZ,
  ];
  for (const boundValue of boundValues) validateFinite('sourceBounds', boundValue);
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ) {
    throw new Error('Dataset source bounds are invalid.');
  }
}

function validateChunkLookup(
  dataset: VegetationDataset,
  storedChunkCount: number,
): void {
  const logicalChunkCount = checkedMultiply(dataset.grid.width, dataset.grid.height);
  if (dataset.chunkLookup.length !== logicalChunkCount) {
    throw new Error('chunkLookup length does not match the logical chunk grid.');
  }

  const referencedStoredChunks = new Uint8Array(storedChunkCount);
  for (const storedChunkIndex of dataset.chunkLookup) {
    if (storedChunkIndex === -1) continue;
    if (
      !Number.isInteger(storedChunkIndex)
      || storedChunkIndex < 0
      || storedChunkIndex >= storedChunkCount
    ) {
      throw new Error(`chunkLookup contains invalid stored index ${storedChunkIndex}.`);
    }
    if (referencedStoredChunks[storedChunkIndex] === 1) {
      throw new Error(
        `chunkLookup references stored index ${storedChunkIndex} more than once.`,
      );
    }
    referencedStoredChunks[storedChunkIndex] = 1;
  }
  if (referencedStoredChunks.some((value) => value === 0)) {
    throw new Error('Every stored chunk must be referenced by chunkLookup exactly once.');
  }
}

function validateHeightData(
  dataset: VegetationDataset,
  storedChunkCount: number,
): void {
  const valuesPerChunk = dataset.heightMap.resolutionPerChunkAxis ** 2;
  if (dataset.heightData.length !== storedChunkCount * valuesPerChunk) {
    throw new Error('heightData length does not match the stored chunks and resolution.');
  }

  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCount; storedChunkIndex += 1) {
    const heightRange = dataset.storedChunkHeightRanges[storedChunkIndex]!;
    validateFinite(
      `storedChunkHeightRanges[${storedChunkIndex}].minimumHeight`,
      heightRange.minimumHeight,
    );
    validateFinite(
      `storedChunkHeightRanges[${storedChunkIndex}].maximumHeight`,
      heightRange.maximumHeight,
    );
    if (heightRange.minimumHeight > heightRange.maximumHeight) {
      throw new Error(`Stored chunk ${storedChunkIndex} has an invalid height interval.`);
    }

    const firstHeightValue = storedChunkIndex * valuesPerChunk;
    for (let sampleIndex = 0; sampleIndex < valuesPerChunk; sampleIndex += 1) {
      const heightValueIndex = firstHeightValue + sampleIndex;
      const height = dataset.heightData[heightValueIndex]!;
      validateFinite(`heightData[${heightValueIndex}]`, height);
      if (height < heightRange.minimumHeight || height > heightRange.maximumHeight) {
        throw new Error(`Height sample ${heightValueIndex} is outside its chunk interval.`);
      }
    }
  }
}

function validateLayers(
  dataset: VegetationDataset,
  storedChunkCount: number,
): void {
  const vegetationLayerIds = new Set<number>();
  for (const layer of dataset.layers) {
    validateUint32(
      `layer "${layer.vegetationLayerKey}" ID`,
      layer.vegetationLayerId,
    );
    if (vegetationLayerIds.has(layer.vegetationLayerId)) {
      throw new Error('Dataset vegetation layer IDs must be unique.');
    }
    vegetationLayerIds.add(layer.vegetationLayerId);
    validateUint16(
      `maskResolutionPerChunkAxis for "${layer.vegetationLayerKey}"`,
      layer.maskResolutionPerChunkAxis,
      1,
    );
    const expectedMaskDataLength = checkedMultiply(
      storedChunkCount,
      layer.maskResolutionPerChunkAxis ** 2,
    );
    if (layer.maskData.length !== expectedMaskDataLength) {
      throw new Error(`Layer "${layer.vegetationLayerKey}" maskData length is invalid.`);
    }
    for (const cellValue of layer.maskData) {
      if (cellValue !== 0 && cellValue !== 1) {
        throw new Error(
          `Layer "${layer.vegetationLayerKey}" maskData may contain only 0 or 1.`,
        );
      }
    }
  }
}

function checkedMultiply(first: number, second: number): number {
  const result = first * second;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Dataset dimensions exceed the JavaScript safe integer range.');
  }
  return result;
}

function validateUint16(name: string, value: number, minimum = 0): void {
  if (!Number.isInteger(value) || value < minimum || value > UINT16_MAX) {
    throw new Error(`${name} must be an unsigned 16-bit integer.`);
  }
}

function validateUint32(name: string, value: number, minimum = 0): void {
  if (!Number.isInteger(value) || value < minimum || value > UINT32_MAX) {
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
  }
}

function validateFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
}

function validateFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }
}
