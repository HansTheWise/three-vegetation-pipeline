export type Axis = 'x' | 'y' | 'z';

export type NameSelector = Readonly<{
  type: 'mesh-name' | 'material-name';
  values: readonly string[];
  caseSensitive: boolean;
}>;

export type SurfaceSelector =
  | Readonly<{ any: readonly NameSelector[] }>
  | Readonly<{ all: readonly NameSelector[] }>;

export type VegetationLayerConfig = Readonly<{
  id: number;
  key: string;
  displayName: string;
  enabled: boolean;
  maskResolution: number;
  surfaceSelector: SurfaceSelector;
  filters: Readonly<{
    maximumSlopeDegrees: number;
  }>;
}>;

/** Configuration subset consumed by the model extractor. */
export type VegetationExtractionConfig = Readonly<{
  coordinateSystem: Readonly<{
    upAxis: Axis;
    horizontalAxes: readonly [Axis, Axis];
    unitsPerMeter: number;
  }>;
  source: Readonly<{
    includeInvisibleObjects: boolean;
    heightSurfaceSelector: SurfaceSelector;
  }>;
  extraction: Readonly<{
    seed: Readonly<{
      mode: 'generated' | 'manual';
      manualValue: number;
    }>;
    grid: Readonly<{
      chunkSize: number;
      includeEmptyChunks: boolean;
    }>;
    heightMap: Readonly<{
      resolution: number;
    }>;
    vegetationMask: Readonly<{
      allowLayerOverlap: boolean;
    }>;
    vegetationLayers: readonly VegetationLayerConfig[];
  }>;
}>;
