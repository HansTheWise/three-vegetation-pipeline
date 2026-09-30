import type { ModelAxis, VegetationLayerId } from '../../shared/vegfile-format/VegetationFileTypes.js';
import type { GlbModelReadingConfig } from '../glb-model-reading/GlbArrayBufferModelReader.js';
import type { VegFileEncodingConfig } from '../veg-file-writing/VegFileWriterTypes.js';

export type { ModelAxis, VegetationLayerId } from '../../shared/vegfile-format/VegetationFileTypes.js';
export type { GlbModelReadingConfig } from '../glb-model-reading/GlbArrayBufferModelReader.js';
export type { VegFileEncodingConfig } from '../veg-file-writing/VegFileWriterTypes.js';

export type ModelSurfaceNameRule =
  | Readonly<{
    property: 'hierarchyNodeName';
    acceptedNames: readonly string[];
    caseSensitive: boolean;
  }>
  | Readonly<{
    property: 'hierarchyNodeNamePrefix';
    acceptedPrefixes: readonly string[];
    caseSensitive: boolean;
  }>
  | Readonly<{
    property: 'materialName';
    acceptedNames: readonly string[];
    caseSensitive: boolean;
  }>;

export type ModelSurfaceSelection =
  | Readonly<{ matchAny: readonly ModelSurfaceNameRule[] }>
  | Readonly<{ matchAll: readonly ModelSurfaceNameRule[] }>;

export type VegetationLayerExtractionConfig = Readonly<{
  vegetationLayerId: VegetationLayerId;
  vegetationLayerKey: string;
  maskResolutionPerChunkAxis: number;
  includedSurfaceSelection: ModelSurfaceSelection;
  excludedSurfaceSelection?: ModelSurfaceSelection;
  filters: Readonly<{
    maximumSlopeDegrees: number;
  }>;
}>;

/** Configuration consumed only by renderer-independent vegetation extraction. */
export type VegetationExtractionConfig = Readonly<{
  coordinateSystem: Readonly<{
    upAxis: ModelAxis;
    horizontalAxes: readonly [ModelAxis, ModelAxis];
    unitsPerMeter: number;
  }>;
  vegetationSeed?: number;
  grid: Readonly<{
    chunkSize: number;
  }>;
  heightMap: Readonly<{
    resolutionPerChunkAxis: number;
    sourceSurfaceSelection: ModelSurfaceSelection;
  }>;
  allowVegetationLayerOverlap: boolean;
  vegetationLayers: readonly VegetationLayerExtractionConfig[];
}>;

/** Module-specific configuration for the complete GLB-to-VEGFILE compilation. */
export type VegetationCompilerConfig = Readonly<{
  glbModelReading: GlbModelReadingConfig;
  extraction: VegetationExtractionConfig;
  vegFileEncoding: VegFileEncodingConfig;
}>;

export type ResolvedVegetationExtractionConfig = VegetationExtractionConfig & Readonly<{
  vegetationSeed: number;
}>;

export type ResolvedVegetationCompilerConfig = Readonly<{
  glbModelReading: GlbModelReadingConfig;
  extraction: ResolvedVegetationExtractionConfig;
  vegFileEncoding: VegFileEncodingConfig;
}>;
