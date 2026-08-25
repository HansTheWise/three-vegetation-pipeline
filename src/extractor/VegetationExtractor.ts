import type {
  Axis,
  SurfaceSelector,
  VegetationExtractionConfig,
  VegetationLayerConfig,
} from '../config/types.js';
import type { ModelData, ModelPrimitive } from '../reader/types.js';
import {
  interpolateHeight,
  slopeDegrees,
  triangleBounds,
  triangleOverlapsRectangle,
  type ExtractionTriangle,
} from './geometry.js';
import type {
  ExtractedChunk,
  VegetationDataset,
  VegetationExtractorOptions,
} from './types.js';

const UINT32_MAX = 0xffff_ffff;
const MAX_GRID_CHUNKS = 10_000_000;

/** Converts neutral model data into file-format-independent vegetation data. */
export function extractVegetation(
  model: ModelData,
  config: VegetationExtractionConfig,
  options: VegetationExtractorOptions = {},
): VegetationDataset {
  validateConfig(config);
  if (!model.bounds) throw new Error('Cannot extract vegetation from an empty model.');

  const enabledLayers = config.extraction.vegetationLayers.filter((layer) => layer.enabled);
  if (enabledLayers.length === 0) throw new Error('No enabled vegetation layers configured.');

  const axis = createAxisReader(config.coordinateSystem);
  const heightTriangles: ExtractionTriangle[] = [];
  const layerTriangles = enabledLayers.map(() => [] as ExtractionTriangle[]);

  for (const primitive of model.primitives) {
    const isHeightSurface = matchesSelector(primitive, config.source.heightSurfaceSelector);
    const matchingLayers = enabledLayers
      .map((layer, layerIndex) => ({ layer, layerIndex }))
      .filter(({ layer }) => matchesSelector(primitive, layer.surfaceSelector));
    if (!isHeightSurface && matchingLayers.length === 0) continue;

    for (let indexOffset = 0; indexOffset < primitive.indices.length; indexOffset += 3) {
      const triangle = readTriangle(primitive, indexOffset, axis);
      if (isHeightSurface) heightTriangles.push(triangle);
      for (const { layer, layerIndex } of matchingLayers) {
        if (slopeDegrees(triangle) <= layer.filters.maximumSlopeDegrees) {
          layerTriangles[layerIndex]!.push(triangle);
        }
      }
    }
  }

  if (heightTriangles.length === 0) {
    throw new Error('Height surface selector did not match any triangles.');
  }

  const grid = createGrid(heightTriangles, config.extraction.grid.chunkSize);
  const possibleChunkCount = grid.width * grid.height;
  if (!Number.isSafeInteger(possibleChunkCount) || possibleChunkCount > MAX_GRID_CHUNKS) {
    throw new Error(`Chunk grid exceeds the limit of ${MAX_GRID_CHUNKS} chunks.`);
  }

  const heightBins = createBins(possibleChunkCount);
  const vegetationBins = enabledLayers.map(() => createBins(possibleChunkCount));
  for (const triangle of heightTriangles) {
    addToBins(triangle, heightBins, grid);
  }
  for (let layerIndex = 0; layerIndex < layerTriangles.length; layerIndex += 1) {
    for (const triangle of layerTriangles[layerIndex]!) {
      addToBins(triangle, vegetationBins[layerIndex]!, grid);
    }
  }

  const chunkLookup = new Int32Array(possibleChunkCount).fill(-1);
  const chunks: ExtractedChunk[] = [];
  const heightChunks: Float64Array[] = [];
  const storedMasks: Uint8Array[][] = [];
  const activeCellCounts = new Array<number>(enabledLayers.length).fill(0);

  for (let logicalIndex = 0; logicalIndex < possibleChunkCount; logicalIndex += 1) {
    const gridX = logicalIndex % grid.width;
    const gridY = Math.floor(logicalIndex / grid.width);
    const chunkOriginX = grid.originX + gridX * grid.chunkSize;
    const chunkOriginY = grid.originY + gridY * grid.chunkSize;
    const masks = vegetationBins.map((layerBins, layerIndex) => {
      const mask = rasterizeMask(
        layerBins[logicalIndex] ?? [],
        chunkOriginX,
        chunkOriginY,
        grid.chunkSize,
        enabledLayers[layerIndex]!.maskResolution,
      );
      activeCellCounts[layerIndex] = (activeCellCounts[layerIndex] ?? 0) + countActiveCells(mask);
      return mask;
    });
    validateLayerOverlap(
      masks,
      enabledLayers,
      config.extraction.vegetationMask.allowLayerOverlap,
      gridX,
      gridY,
    );

    const hasVegetation = masks.some(hasAnyActiveCell);
    if (!config.extraction.grid.includeEmptyChunks && !hasVegetation) continue;

    const heightBin = heightBins[logicalIndex] ?? [];
    if (heightBin.length === 0) {
      throw new Error(`Stored chunk (${gridX}, ${gridY}) has no height triangles.`);
    }
    const sampledHeights = sampleHeightMap(
      heightBin,
      chunkOriginX,
      chunkOriginY,
      grid.chunkSize,
      config.extraction.heightMap.resolution,
    );
    const minimumHeight = minimum(sampledHeights);
    const maximumHeight = maximum(sampledHeights);
    const storedIndex = chunks.length;
    chunkLookup[logicalIndex] = storedIndex;
    chunks.push({ gridX, gridY, minimumHeight, maximumHeight });
    heightChunks.push(sampledHeights);
    storedMasks.push(masks);
  }

  for (let layerIndex = 0; layerIndex < enabledLayers.length; layerIndex += 1) {
    if ((activeCellCounts[layerIndex] ?? 0) === 0) {
      throw new Error(`Enabled vegetation layer "${enabledLayers[layerIndex]!.key}" is empty.`);
    }
  }

  return {
    sourceBounds: model.bounds,
    coordinateSystem: {
      upAxis: config.coordinateSystem.upAxis,
      horizontalAxes: config.coordinateSystem.horizontalAxes,
      unitsPerMeter: config.coordinateSystem.unitsPerMeter,
    },
    seed: resolveSeed(config, options.generateSeed),
    grid,
    heightMap: {
      resolution: config.extraction.heightMap.resolution,
    },
    layers: enabledLayers.map((layer, layerIndex) => ({
      id: layer.id,
      key: layer.key,
      displayName: layer.displayName,
      maskResolution: layer.maskResolution,
      activeCellCount: activeCellCounts[layerIndex] ?? 0,
      maskData: flattenLayerMasks(
        storedMasks,
        layerIndex,
        layer.maskResolution ** 2,
      ),
    })),
    chunkLookup,
    chunks,
    heightData: concatenateFloat64(heightChunks),
  };
}

type AxisReader = Readonly<{
  horizontalX: Axis;
  horizontalY: Axis;
  up: Axis;
}>;

type Grid = VegetationDataset['grid'];

function createAxisReader(config: VegetationExtractionConfig['coordinateSystem']): AxisReader {
  return {
    horizontalX: config.horizontalAxes[0],
    horizontalY: config.horizontalAxes[1],
    up: config.upAxis,
  };
}

function readTriangle(
  primitive: ModelPrimitive,
  indexOffset: number,
  axis: AxisReader,
): ExtractionTriangle {
  return {
    a: readPoint(primitive, primitive.indices[indexOffset], axis),
    b: readPoint(primitive, primitive.indices[indexOffset + 1], axis),
    c: readPoint(primitive, primitive.indices[indexOffset + 2], axis),
  };
}

function readPoint(
  primitive: ModelPrimitive,
  vertexIndex: number | undefined,
  axis: AxisReader,
): ExtractionTriangle['a'] {
  if (vertexIndex === undefined) throw new Error('Incomplete triangle index data.');
  const offset = vertexIndex * 3;
  const x = primitive.positions[offset];
  const y = primitive.positions[offset + 1];
  const z = primitive.positions[offset + 2];
  if (x === undefined || y === undefined || z === undefined) {
    throw new Error(`Triangle index ${vertexIndex} exceeds the position data.`);
  }
  const point = { x, y, z };
  return {
    x: readAxis(point, axis.horizontalX),
    y: readAxis(point, axis.horizontalY),
    height: readAxis(point, axis.up),
  };
}

function readAxis(
  point: Readonly<{ x: number; y: number; z: number }>,
  axis: Axis,
): number {
  return point[axis];
}

function matchesSelector(primitive: ModelPrimitive, selector: SurfaceSelector): boolean {
  const rules = 'all' in selector ? selector.all : selector.any;
  const match = (rule: (typeof rules)[number]): boolean => {
    const candidates = rule.type === 'mesh-name'
      ? primitive.hierarchyNames
      : [primitive.materialName];
    const normalize = rule.caseSensitive
      ? (value: string): string => value
      : (value: string): string => value.toLocaleLowerCase('en-US');
    const expected = new Set(rule.values.map(normalize));
    return candidates.some((candidate) => expected.has(normalize(candidate)));
  };
  return 'all' in selector ? rules.every(match) : rules.some(match);
}

function createGrid(triangles: readonly ExtractionTriangle[], chunkSize: number): Grid {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const triangle of triangles) {
    const bounds = triangleBounds(triangle);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  minX = snapNearChunkBoundary(minX, chunkSize);
  minY = snapNearChunkBoundary(minY, chunkSize);
  maxX = snapNearChunkBoundary(maxX, chunkSize);
  maxY = snapNearChunkBoundary(maxY, chunkSize);
  const originX = Math.floor(minX / chunkSize) * chunkSize;
  const originY = Math.floor(minY / chunkSize) * chunkSize;
  return {
    originX,
    originY,
    width: Math.max(1, Math.ceil((maxX - originX) / chunkSize)),
    height: Math.max(1, Math.ceil((maxY - originY) / chunkSize)),
    chunkSize,
  };
}

function snapNearChunkBoundary(value: number, chunkSize: number): number {
  const chunkCoordinate = value / chunkSize;
  const nearestBoundary = Math.round(chunkCoordinate);
  if (Math.abs(chunkCoordinate - nearestBoundary) > 1e-5) {
    return value;
  }
  return nearestBoundary === 0 ? 0 : nearestBoundary * chunkSize;
}

function createBins(count: number): ExtractionTriangle[][] {
  return Array.from({ length: count }, () => []);
}

function addToBins(
  triangle: ExtractionTriangle,
  bins: ExtractionTriangle[][],
  grid: Grid,
): void {
  const bounds = triangleBounds(triangle);
  const minGridX = clamp(Math.floor((bounds.minX - grid.originX) / grid.chunkSize), 0, grid.width - 1);
  const maxGridX = clamp(Math.ceil((bounds.maxX - grid.originX) / grid.chunkSize) - 1, 0, grid.width - 1);
  const minGridY = clamp(Math.floor((bounds.minY - grid.originY) / grid.chunkSize), 0, grid.height - 1);
  const maxGridY = clamp(Math.ceil((bounds.maxY - grid.originY) / grid.chunkSize) - 1, 0, grid.height - 1);
  for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      bins[gridY * grid.width + gridX]!.push(triangle);
    }
  }
}

function rasterizeMask(
  triangles: readonly ExtractionTriangle[],
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  resolution: number,
): Uint8Array {
  const mask = new Uint8Array(resolution ** 2);
  const cellSize = chunkSize / resolution;
  for (const triangle of triangles) {
    const bounds = triangleBounds(triangle);
    const minCellX = clamp(Math.floor((bounds.minX - chunkOriginX) / cellSize), 0, resolution - 1);
    const maxCellX = clamp(Math.ceil((bounds.maxX - chunkOriginX) / cellSize) - 1, 0, resolution - 1);
    const minCellY = clamp(Math.floor((bounds.minY - chunkOriginY) / cellSize), 0, resolution - 1);
    const maxCellY = clamp(Math.ceil((bounds.maxY - chunkOriginY) / cellSize) - 1, 0, resolution - 1);
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const minX = chunkOriginX + cellX * cellSize;
        const minY = chunkOriginY + cellY * cellSize;
        if (!triangleOverlapsRectangle(
          triangle,
          minX,
          minY,
          minX + cellSize,
          minY + cellSize,
        )) continue;
        const cellIndex = cellY * resolution + cellX;
        mask[cellIndex] = 1;
      }
    }
  }
  return mask;
}

function sampleHeightMap(
  triangles: readonly ExtractionTriangle[],
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  resolution: number,
): Float64Array {
  const values = new Float64Array(resolution ** 2);
  values.fill(Number.NaN);
  const step = chunkSize / (resolution - 1);

  for (const triangle of triangles) {
    const bounds = triangleBounds(triangle);
    const minSampleX = clamp(Math.ceil((bounds.minX - chunkOriginX) / step), 0, resolution - 1);
    const maxSampleX = clamp(Math.floor((bounds.maxX - chunkOriginX) / step), 0, resolution - 1);
    const minSampleY = clamp(Math.ceil((bounds.minY - chunkOriginY) / step), 0, resolution - 1);
    const maxSampleY = clamp(Math.floor((bounds.maxY - chunkOriginY) / step), 0, resolution - 1);
    for (let sampleY = minSampleY; sampleY <= maxSampleY; sampleY += 1) {
      for (let sampleX = minSampleX; sampleX <= maxSampleX; sampleX += 1) {
        const index = sampleY * resolution + sampleX;
        const height = interpolateHeight(
          triangle,
          chunkOriginX + sampleX * step,
          chunkOriginY + sampleY * step,
        );
        if (height !== undefined && (Number.isNaN(values[index]!) || height > values[index]!)) {
          values[index] = height;
        }
      }
    }
    seedNearestSample(values, triangle.a, chunkOriginX, chunkOriginY, step, resolution);
    seedNearestSample(values, triangle.b, chunkOriginX, chunkOriginY, step, resolution);
    seedNearestSample(values, triangle.c, chunkOriginX, chunkOriginY, step, resolution);
  }

  fillMissingSamples(values, resolution);
  return values;
}

function seedNearestSample(
  values: Float64Array,
  point: ExtractionTriangle['a'],
  originX: number,
  originY: number,
  step: number,
  resolution: number,
): void {
  const sampleX = clamp(Math.round((point.x - originX) / step), 0, resolution - 1);
  const sampleY = clamp(Math.round((point.y - originY) / step), 0, resolution - 1);
  const index = sampleY * resolution + sampleX;
  if (Number.isNaN(values[index]!) || point.height > values[index]!) values[index] = point.height;
}

function fillMissingSamples(values: Float64Array, resolution: number): void {
  const queue = new Int32Array(values.length);
  let readOffset = 0;
  let writeOffset = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isNaN(values[index]!)) queue[writeOffset++] = index;
  }
  if (writeOffset === 0) throw new Error('Heightmap contains no usable samples.');

  while (readOffset < writeOffset) {
    const index = queue[readOffset++]!;
    const x = index % resolution;
    const y = Math.floor(index / resolution);
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x + 1 < resolution ? index + 1 : -1,
      y > 0 ? index - resolution : -1,
      y + 1 < resolution ? index + resolution : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || !Number.isNaN(values[neighbour]!)) continue;
      values[neighbour] = values[index]!;
      queue[writeOffset++] = neighbour;
    }
  }
}

function validateLayerOverlap(
  masks: readonly Uint8Array[],
  layers: readonly VegetationLayerConfig[],
  allowOverlap: boolean,
  gridX: number,
  gridY: number,
): void {
  if (allowOverlap) return;
  for (let first = 0; first < masks.length; first += 1) {
    for (let second = first + 1; second < masks.length; second += 1) {
      if (masksOverlap(
        masks[first]!,
        layers[first]!.maskResolution,
        masks[second]!,
        layers[second]!.maskResolution,
      )) {
        throw new Error(`Vegetation layers overlap in chunk (${gridX}, ${gridY}).`);
      }
    }
  }
}

function masksOverlap(
  first: Uint8Array,
  firstResolution: number,
  second: Uint8Array,
  secondResolution: number,
): boolean {
  for (let firstY = 0; firstY < firstResolution; firstY += 1) {
    for (let firstX = 0; firstX < firstResolution; firstX += 1) {
      if (first[firstY * firstResolution + firstX] !== 1) continue;
      const secondMinX = Math.floor((firstX * secondResolution) / firstResolution);
      const secondMaxX = Math.ceil(((firstX + 1) * secondResolution) / firstResolution) - 1;
      const secondMinY = Math.floor((firstY * secondResolution) / firstResolution);
      const secondMaxY = Math.ceil(((firstY + 1) * secondResolution) / firstResolution) - 1;
      for (let secondY = secondMinY; secondY <= secondMaxY; secondY += 1) {
        for (let secondX = secondMinX; secondX <= secondMaxX; secondX += 1) {
          if (second[secondY * secondResolution + secondX] === 1) return true;
        }
      }
    }
  }
  return false;
}

function flattenLayerMasks(
  storedMasks: readonly (readonly Uint8Array[])[],
  layerIndex: number,
  cellsPerChunk: number,
): Uint8Array {
  const result = new Uint8Array(storedMasks.length * cellsPerChunk);
  for (let chunkIndex = 0; chunkIndex < storedMasks.length; chunkIndex += 1) {
    result.set(storedMasks[chunkIndex]![layerIndex]!, chunkIndex * cellsPerChunk);
  }
  return result;
}

function concatenateFloat64(chunks: readonly Float64Array[]): Float64Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float64Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resolveSeed(
  config: VegetationExtractionConfig,
  generateSeed: (() => number) | undefined,
): number {
  if (config.extraction.seed.mode === 'manual') return config.extraction.seed.manualValue >>> 0;
  const seed = (generateSeed ?? randomUint32)();
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new Error('Generated seed must be an unsigned 32-bit integer.');
  }
  return seed >>> 0;
}

function randomUint32(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0]!;
}

function validateConfig(config: VegetationExtractionConfig): void {
  const axes = [config.coordinateSystem.upAxis, ...config.coordinateSystem.horizontalAxes];
  if (new Set(axes).size !== 3) throw new Error('Coordinate axes must be unique.');
  if (!Number.isFinite(config.coordinateSystem.unitsPerMeter) || config.coordinateSystem.unitsPerMeter <= 0) {
    throw new Error('unitsPerMeter must be greater than zero.');
  }
  if (!Number.isFinite(config.extraction.grid.chunkSize) || config.extraction.grid.chunkSize <= 0) {
    throw new Error('chunkSize must be greater than zero.');
  }
  validateResolution('heightMap.resolution', config.extraction.heightMap.resolution, 2);
  const layers = config.extraction.vegetationLayers;
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length) {
    throw new Error('Vegetation layer IDs must be unique.');
  }
  if (new Set(layers.map((layer) => layer.key)).size !== layers.length) {
    throw new Error('Vegetation layer keys must be unique.');
  }
  for (const layer of layers) validateLayer(layer);
  if (config.extraction.seed.mode === 'manual') {
    const seed = config.extraction.seed.manualValue;
    if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
      throw new Error('manualValue must be an unsigned 32-bit integer.');
    }
  }
}

function validateLayer(layer: VegetationLayerConfig): void {
  if (!Number.isInteger(layer.id) || layer.id < 0 || layer.id > UINT32_MAX) {
    throw new Error('Vegetation layer ID must be an unsigned 32-bit integer.');
  }
  if (!layer.key) throw new Error('Vegetation layer key must not be empty.');
  validateResolution(`maskResolution for "${layer.key}"`, layer.maskResolution, 1);
  if (
    !Number.isFinite(layer.filters.maximumSlopeDegrees)
    || layer.filters.maximumSlopeDegrees < 0
    || layer.filters.maximumSlopeDegrees > 90
  ) {
    throw new Error(`maximumSlopeDegrees for "${layer.key}" must be between 0 and 90.`);
  }
}

function validateResolution(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > 4096) {
    throw new Error(`${name} must be an integer between ${minimum} and 4096.`);
  }
}

function minimum(values: Float64Array): number {
  let result = Number.POSITIVE_INFINITY;
  for (const value of values) result = Math.min(result, value);
  return result;
}

function maximum(values: Float64Array): number {
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function countActiveCells(mask: Uint8Array): number {
  let result = 0;
  for (const value of mask) result += value;
  return result;
}

function hasAnyActiveCell(mask: Uint8Array): boolean {
  return mask.some((value) => value !== 0);
}

function clamp(value: number, minimumValue: number, maximumValue: number): number {
  return Math.min(maximumValue, Math.max(minimumValue, value));
}
