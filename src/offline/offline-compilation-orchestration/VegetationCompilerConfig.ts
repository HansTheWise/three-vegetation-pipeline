export type Axis = 'x' | 'y' | 'z';

export type SurfaceNameSelector = Readonly<{
  type: 'hierarchy-node-name' | 'hierarchy-node-name-prefix' | 'material-name';
  values: readonly string[];
  caseSensitive: boolean;
}>;

export type SurfaceSelector =
  | Readonly<{ any: readonly SurfaceNameSelector[] }>
  | Readonly<{ all: readonly SurfaceNameSelector[] }>;

export type VegetationLayerConfig = Readonly<{
  id: number;
  key: string;
  maskResolution: number;
  surfaceSelector: SurfaceSelector;
  exclusionSurfaceSelector?: SurfaceSelector;
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
