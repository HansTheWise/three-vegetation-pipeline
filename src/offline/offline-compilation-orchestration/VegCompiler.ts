import type { VegetationExtractionConfig } from './VegetationCompilerConfig.js';
import { extractVegetation } from '../vegetation-dataset-extraction/VegetationExtractor.js';
import type {
  VegetationDataset,
  VegetationExtractorOptions,
} from '../vegetation-dataset-extraction/VegetationExtractionTypes.js';
import { ThreeGlbReader } from '../three-glb-model-reading/ThreeGlbReader.js';
import type { VegWriterConfig } from '../vegfile-v2-serialization/VegWriterTypes.js';
import { writeVegFile } from '../vegfile-v2-serialization/VegWriter.js';
import { createBuildFingerprint, formatBuildFingerprint } from './VegetationBuildProvenance.js';

export type VegCompilerConfig = VegetationExtractionConfig & Readonly<{
  output: VegWriterConfig;
}>;

export type VegCompilationLayerReport = Readonly<{
  id: number;
  key: string;
  maskResolution: number;
  activeCellCount: number;
  packedMaskByteLength: number;
}>;

export type VegCompilationReport = Readonly<{
  includedMeshCount: number;
  includedTriangleCount: number;
  possibleChunkCount: number;
  storedChunkCount: number;
  heightResolution: number;
  heightValueBits: 8 | 16 | 32;
  seed: number;
  buildFingerprint: string;
  fileByteLength: number;
  layers: readonly VegCompilationLayerReport[];
}>;

export type VegCompilationResult = Readonly<{
  dataset: VegetationDataset;
  buildFingerprint: Uint8Array;
  file: Uint8Array;
  report: VegCompilationReport;
}>;

/** Runs the complete platform-independent GLB -> Dataset -> VEGFILE pipeline. */
export async function compileGlbToVeg(
  source: ArrayBuffer,
  config: VegCompilerConfig,
  options: VegetationExtractorOptions = {},
): Promise<VegCompilationResult> {
  const [model, buildFingerprint] = await Promise.all([
    new ThreeGlbReader({
      includeInvisibleObjects: config.source.includeInvisibleObjects,
    }).readGlb(source),
    createBuildFingerprint(source, config),
  ]);
  const dataset = extractVegetation(model, config, options);
  const file = writeVegFile(dataset, config.output, { buildFingerprint });

  return {
    dataset,
    buildFingerprint,
    file,
    report: {
      includedMeshCount: model.includedMeshCount,
      includedTriangleCount: model.includedTriangleCount,
      possibleChunkCount: dataset.grid.width * dataset.grid.height,
      storedChunkCount: dataset.storedChunkHeightRanges.length,
      heightResolution: dataset.heightMap.resolution,
      heightValueBits: config.output.heightValueBits,
      seed: dataset.seed,
      buildFingerprint: formatBuildFingerprint(buildFingerprint),
      fileByteLength: file.byteLength,
      layers: dataset.layers.map((layer) => ({
        id: layer.id,
        key: layer.key,
        maskResolution: layer.maskResolution,
        activeCellCount: layer.maskData.reduce(
          (activeCellCount, cellValue) => activeCellCount + cellValue,
          0,
        ),
        packedMaskByteLength: dataset.storedChunkHeightRanges.length
          * Math.ceil(layer.maskResolution ** 2 / 32)
          * 4,
      })),
    },
  };
}
