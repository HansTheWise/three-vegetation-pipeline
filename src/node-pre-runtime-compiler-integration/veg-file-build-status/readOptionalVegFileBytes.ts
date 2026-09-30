import { readFile } from 'node:fs/promises';

/** Reads existing VEGFILE bytes or reports that the file is absent. */
export async function readOptionalVegFileBytes(
  outputVegFilePath: string,
): Promise<Uint8Array | null> {
  try {
    return await readFile(outputVegFilePath);
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}
