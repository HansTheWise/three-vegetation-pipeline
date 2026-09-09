export type ModelPosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

/** Transferable initialization data; distance-dependent budgets are not included. */
export type VegetationActiveCellData = Readonly<{
  layerId: number;
  renderTileSizeCells: number;
  indices: Uint32Array;
  offsets: Uint32Array;
  counts: Uint32Array;
}>;
