export type VegetationCellId = Readonly<{
  layerId: number;
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
