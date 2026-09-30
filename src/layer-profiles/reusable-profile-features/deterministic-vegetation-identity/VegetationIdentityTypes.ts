import type { VegetationLayerId } from '../../../shared/vegfile-format/VegetationFileTypes.js';

export type VegetationCellId = Readonly<{
  vegetationLayerId: VegetationLayerId;
  globalCellX: number;
  globalCellY: number;
}>;

export type VegetationAnchorId = Readonly<{
  cell: VegetationCellId;
  anchorIndex: number;
}>;

export type VegetationElementId = Readonly<{
  anchor: VegetationAnchorId;
  elementIndex: number;
}>;
