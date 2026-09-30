import {
  compileGlbToVegFile,
  type GlbToVegFileCompilationResult,
} from '../pre-runtime-compiler-core/CompileGlbToVegFileManager.js';
import type { VegetationCompilerConfig } from '../pre-runtime-compiler-core/configuration/VegetationCompilerConfig.js';
import {
  assertDistinctSourceAndOutputFilePaths,
  resolveOutputVegFilePath,
} from './file-path-validation/PreRuntimeFilePaths.js';
import { NodeGlbFileSource } from './glb-file-source/NodeGlbFileSource.js';
import { writeVegFileAtomically } from './veg-file-output/writeVegFileAtomically.js';

export type GenerateNodeVegFileOptions = Readonly<{
  sourceGlbFilePath: string;
  outputVegFilePath: string;
  vegetationCompilerConfig: VegetationCompilerConfig;
}>;

export type GeneratedNodeVegFile = GlbToVegFileCompilationResult & Readonly<{
  sourceGlbFilePath: string;
  outputVegFilePath: string;
}>;

/** Loads a local GLB, compiles it, and atomically replaces the VEGFILE. */
export async function generateNodeVegFile(
  options: GenerateNodeVegFileOptions,
): Promise<GeneratedNodeVegFile> {
  const nodeGlbFileSource: NodeGlbFileSource = new NodeGlbFileSource(
    options.sourceGlbFilePath,
  );

  const outputVegFilePath = resolveOutputVegFilePath(options.outputVegFilePath);
  assertDistinctSourceAndOutputFilePaths(
    nodeGlbFileSource.sourceGlbFilePath,
    outputVegFilePath,
  );

  const glbArrayBuffer: ArrayBuffer =
    await nodeGlbFileSource.readGlbArrayBuffer();

  const compilationResult: GlbToVegFileCompilationResult =
    await compileGlbToVegFile(
      glbArrayBuffer,
      options.vegetationCompilerConfig,
    );

  await writeVegFileAtomically(
    outputVegFilePath,
    compilationResult.vegFileBytes,
  );

  return {
    ...compilationResult,
    sourceGlbFilePath: nodeGlbFileSource.sourceGlbFilePath,
    outputVegFilePath,
  };
}
