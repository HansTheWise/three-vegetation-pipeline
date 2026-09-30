import {
  calculateTriangleHorizontalBounds,
  findTriangleRectangleOverlapPoint,
  interpolateTriangleHeight,
  type ExtractionTriangle,
} from '../model-triangle-selection/ExtractionGeometry.js';

export type ExtractedChunkHeightMap = Readonly<{
  sampleHeights: Float64Array;
  minimumHeight: number;
  maximumHeight: number;
}>;

export function extractChunkHeightMap(
  heightSurfaceTriangles: readonly ExtractionTriangle[],
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  resolution: number,
): ExtractedChunkHeightMap {
  const sampleHeights = new Float64Array(resolution ** 2);
  sampleHeights.fill(Number.NaN);
  const sampleStep = chunkSize / (resolution - 1);

  for (const triangle of heightSurfaceTriangles) {
    sampleTriangleAtGridPositions(
      sampleHeights,
      triangle,
      chunkOriginX,
      chunkOriginY,
      sampleStep,
      resolution,
    );
  }

  if (!hasUsableHeightSample(sampleHeights)) {
    seedHeightMapFromOverlappingTriangles(
      sampleHeights,
      heightSurfaceTriangles,
      chunkOriginX,
      chunkOriginY,
      chunkSize,
      sampleStep,
      resolution,
    );
  }
  fillMissingHeightSamples(sampleHeights, resolution);

  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (const height of sampleHeights) {
    minimumHeight = Math.min(minimumHeight, height);
    maximumHeight = Math.max(maximumHeight, height);
  }
  return { sampleHeights, minimumHeight, maximumHeight };
}

export function concatenateChunkHeightMaps(
  chunkHeightMaps: readonly Float64Array[],
): Float64Array {
  const sampleCount = chunkHeightMaps.reduce(
    (total, chunkHeightMap) => total + chunkHeightMap.length,
    0,
  );
  const concatenatedHeightMaps = new Float64Array(sampleCount);
  let writeOffset = 0;
  for (const chunkHeightMap of chunkHeightMaps) {
    concatenatedHeightMaps.set(chunkHeightMap, writeOffset);
    writeOffset += chunkHeightMap.length;
  }
  return concatenatedHeightMaps;
}

function sampleTriangleAtGridPositions(
  sampleHeights: Float64Array,
  triangle: ExtractionTriangle,
  chunkOriginX: number,
  chunkOriginY: number,
  sampleStep: number,
  resolution: number,
): void {
  const triangleBounds = calculateTriangleHorizontalBounds(triangle);
  const minimumSampleX = clamp(
    Math.ceil((triangleBounds.minimumX - chunkOriginX) / sampleStep),
    0,
    resolution - 1,
  );
  const maximumSampleX = clamp(
    Math.floor((triangleBounds.maximumX - chunkOriginX) / sampleStep),
    0,
    resolution - 1,
  );
  const minimumSampleY = clamp(
    Math.ceil((triangleBounds.minimumY - chunkOriginY) / sampleStep),
    0,
    resolution - 1,
  );
  const maximumSampleY = clamp(
    Math.floor((triangleBounds.maximumY - chunkOriginY) / sampleStep),
    0,
    resolution - 1,
  );

  for (let sampleY = minimumSampleY; sampleY <= maximumSampleY; sampleY += 1) {
    for (let sampleX = minimumSampleX; sampleX <= maximumSampleX; sampleX += 1) {
      const sampleIndex = sampleY * resolution + sampleX;
      const height = interpolateTriangleHeight(
        triangle,
        chunkOriginX + sampleX * sampleStep,
        chunkOriginY + sampleY * sampleStep,
      );
      if (
        height !== undefined
        && (
          Number.isNaN(sampleHeights[sampleIndex]!)
          || height > sampleHeights[sampleIndex]!
        )
      ) {
        sampleHeights[sampleIndex] = height;
      }
    }
  }
}

/**
 * A very narrow triangle can overlap a chunk without covering a grid sample.
 * Only in that case, seed one sample with a height from the actual overlap.
 */
function seedHeightMapFromOverlappingTriangles(
  sampleHeights: Float64Array,
  triangles: readonly ExtractionTriangle[],
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  sampleStep: number,
  resolution: number,
): void {
  for (const triangle of triangles) {
    const overlapPoint = findTriangleRectangleOverlapPoint(
      triangle,
      chunkOriginX,
      chunkOriginY,
      chunkOriginX + chunkSize,
      chunkOriginY + chunkSize,
    );
    if (!overlapPoint) continue;
    const sampleX = clamp(
      Math.round((overlapPoint.horizontalX - chunkOriginX) / sampleStep),
      0,
      resolution - 1,
    );
    const sampleY = clamp(
      Math.round((overlapPoint.horizontalY - chunkOriginY) / sampleStep),
      0,
      resolution - 1,
    );
    const sampleIndex = sampleY * resolution + sampleX;
    if (
      Number.isNaN(sampleHeights[sampleIndex]!)
      || overlapPoint.height > sampleHeights[sampleIndex]!
    ) {
      sampleHeights[sampleIndex] = overlapPoint.height;
    }
  }
}

function hasUsableHeightSample(sampleHeights: Float64Array): boolean {
  return sampleHeights.some((height) => !Number.isNaN(height));
}

function fillMissingHeightSamples(
  sampleHeights: Float64Array,
  resolution: number,
): void {
  const propagationQueue = new Int32Array(sampleHeights.length);
  let readOffset = 0;
  let writeOffset = 0;
  for (let sampleIndex = 0; sampleIndex < sampleHeights.length; sampleIndex += 1) {
    if (!Number.isNaN(sampleHeights[sampleIndex]!)) {
      propagationQueue[writeOffset++] = sampleIndex;
    }
  }
  if (writeOffset === 0) throw new Error('Heightmap contains no usable samples.');

  while (readOffset < writeOffset) {
    const sampleIndex = propagationQueue[readOffset++]!;
    const sampleX = sampleIndex % resolution;
    const sampleY = Math.floor(sampleIndex / resolution);
    const neighbourIndices = [
      sampleX > 0 ? sampleIndex - 1 : -1,
      sampleX + 1 < resolution ? sampleIndex + 1 : -1,
      sampleY > 0 ? sampleIndex - resolution : -1,
      sampleY + 1 < resolution ? sampleIndex + resolution : -1,
    ];
    for (const neighbourIndex of neighbourIndices) {
      if (
        neighbourIndex < 0
        || !Number.isNaN(sampleHeights[neighbourIndex]!)
      ) {
        continue;
      }
      sampleHeights[neighbourIndex] = sampleHeights[sampleIndex]!;
      propagationQueue[writeOffset++] = neighbourIndex;
    }
  }
}

function clamp(value: number, minimumValue: number, maximumValue: number): number {
  return Math.min(maximumValue, Math.max(minimumValue, value));
}
