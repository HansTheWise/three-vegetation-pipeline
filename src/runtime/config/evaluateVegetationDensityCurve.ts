import type { VegetationDensityCurvePoint } from './types.js';

/** Linearly evaluates a validated, monotonically decreasing density curve. */
export function evaluateVegetationDensityCurve(
  points: readonly VegetationDensityCurvePoint[],
  distanceMeters: number,
): number {
  if (distanceMeters <= points[0]!.distanceMeters) return points[0]!.ratio;
  for (let index = 1; index < points.length; index += 1) {
    const end = points[index]!;
    if (distanceMeters > end.distanceMeters) continue;
    const start = points[index - 1]!;
    const progress = (distanceMeters - start.distanceMeters)
      / (end.distanceMeters - start.distanceMeters);
    return start.ratio + (end.ratio - start.ratio) * progress;
  }
  return points.at(-1)!.ratio;
}
