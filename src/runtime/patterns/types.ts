export type VegetationPatternSet = Readonly<{
  patternCount: number;
  anchorsPerPattern: number;
  /** Interleaved normalized [x, y] positions in pattern-major order. */
  anchorPositions: Float32Array;
}>;

export type CellPatternSelection = Readonly<{
  patternIndex: number;
  rotationQuarterTurns: 0 | 1 | 2 | 3;
  reflected: boolean;
}>;
