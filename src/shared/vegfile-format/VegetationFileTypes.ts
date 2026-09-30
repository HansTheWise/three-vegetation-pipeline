export type HeightValueBits = 8 | 16 | 32;

export type ModelAxis = 'x' | 'y' | 'z';

export type VegetationLayerId = number;

export type Bounds3 = Readonly<{
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}>;
