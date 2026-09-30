import { parseVegFile } from '../../shared/vegfile-parsing/VegParser.js';
import type { VegetationCompilerConfig } from '../configuration/VegetationCompilerConfig.js';
import { resolveVegetationCompilerConfig } from '../configuration/validateVegetationCompilerConfig.js';
import { validateGlbArrayBuffer } from '../glb-array-buffer-validation/validateGlbArrayBuffer.js';
import {
  createVegFileBuildFingerprint,
  formatVegFileBuildFingerprint,
} from '../VegFileBuildFingerprint.js';

export type EvaluateVegFileBuildStatusInput = Readonly<{
  glbArrayBuffer: ArrayBuffer;
  vegetationCompilerConfig: VegetationCompilerConfig;
  existingVegFileBytes: Uint8Array | null;
}>;

type VegFileBuildStatusBase = Readonly<{
  expectedBuildFingerprint: string;
}>;

export type VegFileBuildStatus =
  | VegFileBuildStatusBase & Readonly<{
    status: 'up-to-date';
    actualBuildFingerprint: string;
    vegFileByteLength: number;
  }>
  | VegFileBuildStatusBase & Readonly<{
    status: 'missing';
  }>
  | VegFileBuildStatusBase & Readonly<{
    status: 'outdated';
    actualBuildFingerprint: string;
    vegFileByteLength: number;
  }>
  | VegFileBuildStatusBase & Readonly<{
    status: 'invalid';
    validationError: string;
    vegFileByteLength: number;
  }>;

/** Evaluates source/config provenance against optional existing VEGFILE bytes. */
export async function evaluateVegFileBuildStatus(
  input: EvaluateVegFileBuildStatusInput,
): Promise<VegFileBuildStatus> {
  const resolvedConfig = resolveVegetationCompilerConfig(
    input.vegetationCompilerConfig,
  );
  validateGlbArrayBuffer(input.glbArrayBuffer);

  const expectedFingerprintBytes: Uint8Array =
    await createVegFileBuildFingerprint(input.glbArrayBuffer, resolvedConfig);
  const expectedBuildFingerprint: string = formatVegFileBuildFingerprint(
    expectedFingerprintBytes,
  );

  if (!input.existingVegFileBytes) {
    return { status: 'missing', expectedBuildFingerprint };
  }

  let actualFingerprintBytes: Uint8Array;
  try {
    actualFingerprintBytes = parseVegFile(
      input.existingVegFileBytes,
    ).header.buildFingerprint;
  } catch (error) {
    return {
      status: 'invalid',
      expectedBuildFingerprint,
      validationError: error instanceof Error ? error.message : String(error),
      vegFileByteLength: input.existingVegFileBytes.byteLength,
    };
  }

  const actualBuildFingerprint: string = formatVegFileBuildFingerprint(
    actualFingerprintBytes,
  );
  if (!equalBytes(actualFingerprintBytes, expectedFingerprintBytes)) {
    return {
      status: 'outdated',
      expectedBuildFingerprint,
      actualBuildFingerprint,
      vegFileByteLength: input.existingVegFileBytes.byteLength,
    };
  }

  return {
    status: 'up-to-date',
    expectedBuildFingerprint,
    actualBuildFingerprint,
    vegFileByteLength: input.existingVegFileBytes.byteLength,
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length
    && left.every((byte, index) => byte === right[index]);
}
