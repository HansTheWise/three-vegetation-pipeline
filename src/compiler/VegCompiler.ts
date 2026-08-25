import type { VegetationExtractionConfig } from '../config/types.js';
import { extractVegetation } from '../extractor/VegetationExtractor.js';
import type {
  VegetationDataset,
  VegetationExtractorOptions,
} from '../extractor/types.js';
import { ThreeGlbReader } from '../reader/ThreeGlbReader.js';
import type { VegWriterConfig } from '../writer/types.js';
import { writeVegFile } from '../writer/VegWriter.js';

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
  sourceMeshCount: number;
  triangleCount: number;
  possibleChunkCount: number;
  storedChunkCount: number;
  heightResolution: number;
  heightValueBits: 8 | 16 | 32;
  seed: number;
  fileByteLength: number;
  layers: readonly VegCompilationLayerReport[];
}>;

export type VegCompilationResult = Readonly<{
  dataset: VegetationDataset;
  file: Uint8Array;
  report: VegCompilationReport;
}>;

/** Runs the complete platform-independent GLB -> Dataset -> VEGFILE pipeline. */
export async function compileGlbToVeg(
  source: ArrayBuffer,
  config: VegCompilerConfig,
  options: VegetationExtractorOptions = {},
): Promise<VegCompilationResult> {
  const model = await new ThreeGlbReader({
    includeInvisibleObjects: config.source.includeInvisibleObjects,
  }).read(source);
  const dataset = extractVegetation(model, config, options);
  const file = writeVegFile(dataset, config.output);

  return {
    dataset,
    file,
    report: {
      sourceMeshCount: model.sourceMeshCount,
      triangleCount: model.triangleCount,
      possibleChunkCount: dataset.grid.width * dataset.grid.height,
      storedChunkCount: dataset.chunks.length,
      heightResolution: dataset.heightMap.resolution,
      heightValueBits: config.output.heightValueBits,
      seed: dataset.seed,
      fileByteLength: file.byteLength,
      layers: dataset.layers.map((layer) => ({
        id: layer.id,
        key: layer.key,
        maskResolution: layer.maskResolution,
        activeCellCount: layer.activeCellCount,
        packedMaskByteLength: dataset.chunks.length
          * Math.ceil(layer.maskResolution ** 2 / 32)
          * 4,
      })),
    },
  };
}
