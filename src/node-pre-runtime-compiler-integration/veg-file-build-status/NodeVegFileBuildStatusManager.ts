import {
  evaluateVegFileBuildStatus,
  type VegFileBuildStatus,
} from '../../pre-runtime-compiler-core/veg-file-build-status/VegFileBuildStatusManager.js';
import type { GenerateNodeVegFileOptions } from '../NodeVegFileGenerationManager.js';
import { NodeGlbFileSource } from '../glb-file-source/NodeGlbFileSource.js';
import {
  assertDistinctSourceAndOutputFilePaths,
  resolveOutputVegFilePath,
} from '../file-path-validation/PreRuntimeFilePaths.js';
import { readOptionalVegFileBytes } from './readOptionalVegFileBytes.js';

export type CheckVegFileBuildStatusOptions = GenerateNodeVegFileOptions;
export type { VegFileBuildStatus } from '../../pre-runtime-compiler-core/veg-file-build-status/VegFileBuildStatusManager.js';

/** Checks source/config provenance and full VEGFILE validity without extraction. */
export async function checkVegFileBuildStatus(
  options: CheckVegFileBuildStatusOptions,
): Promise<VegFileBuildStatus> {
  const nodeGlbFileSource: NodeGlbFileSource = new NodeGlbFileSource(
    options.sourceGlbFilePath,
  );
  const outputVegFilePath: string = resolveOutputVegFilePath(
    options.outputVegFilePath,
  );
  assertDistinctSourceAndOutputFilePaths(
    nodeGlbFileSource.sourceGlbFilePath,
    outputVegFilePath,
  );

  const glbArrayBuffer: ArrayBuffer =
    await nodeGlbFileSource.readGlbArrayBuffer();
  const existingVegFileBytes: Uint8Array | null =
    await readOptionalVegFileBytes(outputVegFilePath);

  return evaluateVegFileBuildStatus({
    glbArrayBuffer,
    vegetationCompilerConfig: options.vegetationCompilerConfig,
    existingVegFileBytes,
  });
}
