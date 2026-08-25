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
    space: 'model-local';
    upAxis: Axis;
    horizontalAxes: readonly [Axis, Axis];
    unitsPerMeter: number;
  }>;
  source: Readonly<{
    format: 'glb';
    reader: 'three-gltf-loader';
    includeInvisibleObjects: boolean;
    heightSurfaceSelector: SurfaceSelector;
  }>;
  extraction: Readonly<{
    seed: Readonly<{
      mode: 'generated' | 'manual';
      manualValue: number;
    }>;
    grid: Readonly<{
      strategy: 'fixed-world-size';
      chunkSize: number;
      origin: Readonly<{
        mode: 'snap-to-height-surface-bounds';
      }>;
      boundsSource: 'height-surfaces';
      includeEmptyChunks: boolean;
    }>;
    heightMap: Readonly<{
      resolution: number;
      samplePlacement: 'include-chunk-borders';
    }>;
    vegetationMask: Readonly<{
      cellActivation: 'triangle-overlap';
      allowLayerOverlap: boolean;
    }>;
    vegetationLayers: readonly VegetationLayerConfig[];
  }>;
}>;
