const EPSILON = 1e-9;

export type Point2Height = Readonly<{
  x: number;
  y: number;
  height: number;
}>;

export type ExtractionTriangle = Readonly<{
  a: Point2Height;
  b: Point2Height;
  c: Point2Height;
}>;

export type Bounds2 = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

export function triangleBounds(triangle: ExtractionTriangle): Bounds2 {
  return {
    minX: Math.min(triangle.a.x, triangle.b.x, triangle.c.x),
    minY: Math.min(triangle.a.y, triangle.b.y, triangle.c.y),
    maxX: Math.max(triangle.a.x, triangle.b.x, triangle.c.x),
    maxY: Math.max(triangle.a.y, triangle.b.y, triangle.c.y),
  };
}

export function interpolateHeight(
  triangle: ExtractionTriangle,
  x: number,
  y: number,
): number | undefined {
  const weights = barycentric(triangle, x, y);
  if (!weights) return undefined;
  return weights[0] * triangle.a.height
    + weights[1] * triangle.b.height
    + weights[2] * triangle.c.height;
}

export function slopeDegrees(triangle: ExtractionTriangle): number {
  const abX = triangle.b.x - triangle.a.x;
  const abY = triangle.b.y - triangle.a.y;
  const abHeight = triangle.b.height - triangle.a.height;
  const acX = triangle.c.x - triangle.a.x;
  const acY = triangle.c.y - triangle.a.y;
  const acHeight = triangle.c.height - triangle.a.height;
  const normalX = abY * acHeight - abHeight * acY;
  const normalY = abHeight * acX - abX * acHeight;
  const normalUp = abX * acY - abY * acX;
  const length = Math.hypot(normalX, normalY, normalUp);
  if (length <= EPSILON) return 90;
  return Math.acos(Math.min(1, Math.abs(normalUp) / length)) * 180 / Math.PI;
}

export function triangleOverlapsRectangle(
  triangle: ExtractionTriangle,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const vertices = [triangle.a, triangle.b, triangle.c] as const;
  if (vertices.some((point) => pointInRectangle(point.x, point.y, minX, minY, maxX, maxY))) {
    return true;
  }

  const corners = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ] as const;
  if (corners.some(([x, y]) => barycentric(triangle, x, y) !== undefined)) {
    return true;
  }

  const triangleEdges = [
    [triangle.a.x, triangle.a.y, triangle.b.x, triangle.b.y],
    [triangle.b.x, triangle.b.y, triangle.c.x, triangle.c.y],
    [triangle.c.x, triangle.c.y, triangle.a.x, triangle.a.y],
  ] as const;
  const rectangleEdges = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
  ] as const;
  return triangleEdges.some((edge) => (
    rectangleEdges.some((rectangleEdge) => segmentsIntersect(edge, rectangleEdge))
  ));
}

function barycentric(
  triangle: ExtractionTriangle,
  x: number,
  y: number,
): readonly [number, number, number] | undefined {
  const abX = triangle.b.x - triangle.a.x;
  const abY = triangle.b.y - triangle.a.y;
  const acX = triangle.c.x - triangle.a.x;
  const acY = triangle.c.y - triangle.a.y;
  const pointX = x - triangle.a.x;
  const pointY = y - triangle.a.y;
  const denominator = abX * acY - acX * abY;
  if (Math.abs(denominator) <= EPSILON) return undefined;
  const weightB = (pointX * acY - acX * pointY) / denominator;
  const weightC = (abX * pointY - pointX * abY) / denominator;
  const weightA = 1 - weightB - weightC;
  if (weightA < -EPSILON || weightB < -EPSILON || weightC < -EPSILON) {
    return undefined;
  }
  return [weightA, weightB, weightC];
}

function pointInRectangle(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  return x >= minX - EPSILON && x <= maxX + EPSILON
    && y >= minY - EPSILON && y <= maxY + EPSILON;
}

function segmentsIntersect(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): boolean {
  const [aX, aY, bX, bY] = a;
  const [cX, cY, dX, dY] = b;
  const abC = orientation(aX, aY, bX, bY, cX, cY);
  const abD = orientation(aX, aY, bX, bY, dX, dY);
  const cdA = orientation(cX, cY, dX, dY, aX, aY);
  const cdB = orientation(cX, cY, dX, dY, bX, bY);

  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true;
  }
  return (Math.abs(abC) <= EPSILON && pointOnSegment(cX, cY, aX, aY, bX, bY))
    || (Math.abs(abD) <= EPSILON && pointOnSegment(dX, dY, aX, aY, bX, bY))
    || (Math.abs(cdA) <= EPSILON && pointOnSegment(aX, aY, cX, cY, dX, dY))
    || (Math.abs(cdB) <= EPSILON && pointOnSegment(bX, bY, cX, cY, dX, dY));
}

function orientation(
  aX: number,
  aY: number,
  bX: number,
  bY: number,
  cX: number,
  cY: number,
): number {
  return (bX - aX) * (cY - aY) - (bY - aY) * (cX - aX);
}

function pointOnSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): boolean {
  return pointX >= Math.min(startX, endX) - EPSILON
    && pointX <= Math.max(startX, endX) + EPSILON
    && pointY >= Math.min(startY, endY) - EPSILON
    && pointY <= Math.max(startY, endY) + EPSILON;
}
