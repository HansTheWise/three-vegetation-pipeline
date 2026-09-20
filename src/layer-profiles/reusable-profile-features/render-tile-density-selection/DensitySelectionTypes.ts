export type ModelPosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type VegetationDensityCurvePoint = Readonly<{
  distanceMeters: number;
  ratio: number;
}>;

/** RGBA32UI component count of one visible render-tile record. */
export const RENDER_TILE_RECORD_UINT32_COUNT = 4;

/** Layer fields required by reusable render-tile density selection. */
export type VegetationRenderTileDensityLayerConfig = Readonly<{
  density: Readonly<{
    renderTileSizeCells: number;
    activeCells: readonly VegetationDensityCurvePoint[];
    activeAnchors: readonly VegetationDensityCurvePoint[];
    activeElements: readonly VegetationDensityCurvePoint[];
  }>;
  distribution: Readonly<{
    anchorsPerCell: number;
    elementsPerAnchor: number;
  }>;
  visibility: Readonly<{
    maximumDistanceMeters: number;
  }>;
}>;

/** Transferable initialization data; distance-dependent budgets are not included. */
export type VegetationActiveCellData = Readonly<{
  layerId: number;
  renderTileSizeCells: number;
  indices: Uint32Array;
  offsets: Uint32Array;
  counts: Uint32Array;
}>;
