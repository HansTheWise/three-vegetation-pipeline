import { resolveVegetationCompilerConfig } from './configuration/validateVegetationCompilerConfig.js';
import type {
  ResolvedVegetationCompilerConfig,
  VegetationCompilerConfig,
} from './configuration/VegetationCompilerConfig.js';
import { validateGlbArrayBuffer } from './glb-array-buffer-validation/validateGlbArrayBuffer.js';
import { GlbArrayBufferModelReader } from './glb-model-reading/GlbArrayBufferModelReader.js';
import type { ModelData } from './glb-model-reading/ModelInputTypes.js';
import { createVegFileBuildFingerprint } from './VegFileBuildFingerprint.js';
import { extractVegetation } from './vegetation-dataset-extraction/VegetationExtractorManager.js';
import type { VegetationDataset } from './vegetation-dataset-extraction/VegetationExtractionTypes.js';
import { writeVegFile } from './veg-file-writing/VegFileWriter.js';

/** Runs the complete source-independent GLB -> Dataset -> VEGFILE pipeline. */
export async function compileGlbToVegFile(
  glbArrayBuffer: ArrayBuffer,
  vegetationCompilerConfig: VegetationCompilerConfig,
): Promise<GlbToVegFileCompilationResult> {
  const resolvedConfig: ResolvedVegetationCompilerConfig =
    resolveVegetationCompilerConfig(vegetationCompilerConfig);

  validateGlbArrayBuffer(glbArrayBuffer);

  const glbArrayBufferModelReader: GlbArrayBufferModelReader =
    new GlbArrayBufferModelReader(
      resolvedConfig.glbModelReading,
    );
  const modelData: ModelData =
    await glbArrayBufferModelReader.readModelData(glbArrayBuffer);

  const vegetationDataset: VegetationDataset = extractVegetation(
    modelData,
    resolvedConfig.extraction,
  );

  const vegFileBuildFingerprint: Uint8Array = await createVegFileBuildFingerprint(
    glbArrayBuffer,
    resolvedConfig,
  );

  const vegFileBytes: Uint8Array = writeVegFile(
    vegetationDataset,
    resolvedConfig.vegFileEncoding,
    { buildFingerprint: vegFileBuildFingerprint },
  );

  return {
    buildFingerprint: vegFileBuildFingerprint,
    vegFileBytes,
  };
}

export type GlbToVegFileCompilationResult = Readonly<{
  buildFingerprint: Uint8Array;
  vegFileBytes: Uint8Array;
}>;
