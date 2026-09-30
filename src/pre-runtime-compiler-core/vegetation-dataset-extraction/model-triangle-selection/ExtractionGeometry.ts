const GEOMETRY_EPSILON = 1e-9;

export type HeightSurfacePoint = Readonly<{
  horizontalX: number;
  horizontalY: number;
  height: number;
}>;

export type ExtractionTriangle = Readonly<{
  firstVertex: HeightSurfacePoint;
  secondVertex: HeightSurfacePoint;
  thirdVertex: HeightSurfacePoint;
}>;

export type HorizontalBounds = Readonly<{
  minimumX: number;
  minimumY: number;
  maximumX: number;
  maximumY: number;
}>;

export function calculateTriangleHorizontalBounds(
  triangle: ExtractionTriangle,
): HorizontalBounds {
  return {
    minimumX: Math.min(
      triangle.firstVertex.horizontalX,
      triangle.secondVertex.horizontalX,
      triangle.thirdVertex.horizontalX,
    ),
    minimumY: Math.min(
      triangle.firstVertex.horizontalY,
      triangle.secondVertex.horizontalY,
      triangle.thirdVertex.horizontalY,
    ),
    maximumX: Math.max(
      triangle.firstVertex.horizontalX,
      triangle.secondVertex.horizontalX,
      triangle.thirdVertex.horizontalX,
    ),
    maximumY: Math.max(
      triangle.firstVertex.horizontalY,
      triangle.secondVertex.horizontalY,
      triangle.thirdVertex.horizontalY,
    ),
  };
}

export function interpolateTriangleHeight(
  triangle: ExtractionTriangle,
  horizontalX: number,
  horizontalY: number,
): number | undefined {
  const weights = calculateBarycentricWeights(triangle, horizontalX, horizontalY);
  if (!weights) return undefined;
  return weights[0] * triangle.firstVertex.height
    + weights[1] * triangle.secondVertex.height
    + weights[2] * triangle.thirdVertex.height;
}

export function calculateTriangleSlopeDegrees(triangle: ExtractionTriangle): number {
  const firstEdgeX = triangle.secondVertex.horizontalX - triangle.firstVertex.horizontalX;
  const firstEdgeY = triangle.secondVertex.horizontalY - triangle.firstVertex.horizontalY;
  const firstEdgeHeight = triangle.secondVertex.height - triangle.firstVertex.height;
  const secondEdgeX = triangle.thirdVertex.horizontalX - triangle.firstVertex.horizontalX;
  const secondEdgeY = triangle.thirdVertex.horizontalY - triangle.firstVertex.horizontalY;
  const secondEdgeHeight = triangle.thirdVertex.height - triangle.firstVertex.height;
  const normalX = firstEdgeY * secondEdgeHeight - firstEdgeHeight * secondEdgeY;
  const normalY = firstEdgeHeight * secondEdgeX - firstEdgeX * secondEdgeHeight;
  const normalUp = firstEdgeX * secondEdgeY - firstEdgeY * secondEdgeX;
  const normalLength = Math.hypot(normalX, normalY, normalUp);
  if (normalLength <= GEOMETRY_EPSILON) return 90;
  return Math.acos(Math.min(1, Math.abs(normalUp) / normalLength)) * 180 / Math.PI;
}

export function triangleOverlapsHorizontalRectangle(
  triangle: ExtractionTriangle,
  minimumX: number,
  minimumY: number,
  maximumX: number,
  maximumY: number,
): boolean {
  return findTriangleRectangleOverlapPoint(
    triangle,
    minimumX,
    minimumY,
    maximumX,
    maximumY,
  ) !== undefined;
}

/**
 * Returns one point that lies inside both the triangle and rectangle.
 * Height is interpolated while the triangle is clipped, so it always belongs
 * to the returned horizontal position.
 */
export function findTriangleRectangleOverlapPoint(
  triangle: ExtractionTriangle,
  minimumX: number,
  minimumY: number,
  maximumX: number,
  maximumY: number,
): HeightSurfacePoint | undefined {
  let clippedPolygon: readonly HeightSurfacePoint[] = [
    triangle.firstVertex,
    triangle.secondVertex,
    triangle.thirdVertex,
  ];
  clippedPolygon = clipPolygonAgainstBoundary(
    clippedPolygon,
    'horizontalX',
    minimumX,
    true,
  );
  clippedPolygon = clipPolygonAgainstBoundary(
    clippedPolygon,
    'horizontalX',
    maximumX,
    false,
  );
  clippedPolygon = clipPolygonAgainstBoundary(
    clippedPolygon,
    'horizontalY',
    minimumY,
    true,
  );
  clippedPolygon = clipPolygonAgainstBoundary(
    clippedPolygon,
    'horizontalY',
    maximumY,
    false,
  );
  if (clippedPolygon.length === 0) return undefined;

  const pointCount = clippedPolygon.length;
  return {
    horizontalX: clippedPolygon.reduce((sum, point) => sum + point.horizontalX, 0)
      / pointCount,
    horizontalY: clippedPolygon.reduce((sum, point) => sum + point.horizontalY, 0)
      / pointCount,
    height: clippedPolygon.reduce((sum, point) => sum + point.height, 0)
      / pointCount,
  };
}

type HorizontalAxis = 'horizontalX' | 'horizontalY';

function clipPolygonAgainstBoundary(
  polygon: readonly HeightSurfacePoint[],
  axis: HorizontalAxis,
  boundary: number,
  keepGreaterValues: boolean,
): readonly HeightSurfacePoint[] {
  if (polygon.length === 0) return polygon;
  const clipped: HeightSurfacePoint[] = [];
  let previousPoint = polygon[polygon.length - 1]!;
  let previousDistance = distanceFromBoundary(
    previousPoint,
    axis,
    boundary,
    keepGreaterValues,
  );

  for (const currentPoint of polygon) {
    const currentDistance = distanceFromBoundary(
      currentPoint,
      axis,
      boundary,
      keepGreaterValues,
    );
    const previousInside = previousDistance >= -GEOMETRY_EPSILON;
    const currentInside = currentDistance >= -GEOMETRY_EPSILON;
    if (previousInside !== currentInside) {
      clipped.push(interpolateBoundaryIntersection(
        previousPoint,
        currentPoint,
        previousDistance,
        currentDistance,
      ));
    }
    if (currentInside) clipped.push(currentPoint);
    previousPoint = currentPoint;
    previousDistance = currentDistance;
  }
  return clipped;
}

function distanceFromBoundary(
  point: HeightSurfacePoint,
  axis: HorizontalAxis,
  boundary: number,
  keepGreaterValues: boolean,
): number {
  return keepGreaterValues ? point[axis] - boundary : boundary - point[axis];
}

function interpolateBoundaryIntersection(
  start: HeightSurfacePoint,
  end: HeightSurfacePoint,
  startDistance: number,
  endDistance: number,
): HeightSurfacePoint {
  const progress = startDistance / (startDistance - endDistance);
  return {
    horizontalX: start.horizontalX
      + (end.horizontalX - start.horizontalX) * progress,
    horizontalY: start.horizontalY
      + (end.horizontalY - start.horizontalY) * progress,
    height: start.height + (end.height - start.height) * progress,
  };
}

function calculateBarycentricWeights(
  triangle: ExtractionTriangle,
  horizontalX: number,
  horizontalY: number,
): readonly [number, number, number] | undefined {
  const firstEdgeX = triangle.secondVertex.horizontalX - triangle.firstVertex.horizontalX;
  const firstEdgeY = triangle.secondVertex.horizontalY - triangle.firstVertex.horizontalY;
  const secondEdgeX = triangle.thirdVertex.horizontalX - triangle.firstVertex.horizontalX;
  const secondEdgeY = triangle.thirdVertex.horizontalY - triangle.firstVertex.horizontalY;
  const pointX = horizontalX - triangle.firstVertex.horizontalX;
  const pointY = horizontalY - triangle.firstVertex.horizontalY;
  const denominator = firstEdgeX * secondEdgeY - secondEdgeX * firstEdgeY;
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return undefined;
  const secondWeight = (pointX * secondEdgeY - secondEdgeX * pointY) / denominator;
  const thirdWeight = (firstEdgeX * pointY - pointX * firstEdgeY) / denominator;
  const firstWeight = 1 - secondWeight - thirdWeight;
  if (
    firstWeight < -GEOMETRY_EPSILON
    || secondWeight < -GEOMETRY_EPSILON
    || thirdWeight < -GEOMETRY_EPSILON
  ) {
    return undefined;
  }
  return [firstWeight, secondWeight, thirdWeight];
}
