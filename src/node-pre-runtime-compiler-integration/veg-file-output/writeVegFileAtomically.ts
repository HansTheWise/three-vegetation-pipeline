import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

export async function writeVegFileAtomically(
  outputVegFilePath: string,
  vegFileBytes: Uint8Array,
): Promise<void> {
  const outputDirectory = dirname(outputVegFilePath);
  await mkdir(outputDirectory, { recursive: true });
  const temporaryVegFilePath = resolve(
    outputDirectory,
    `.${basename(outputVegFilePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryVegFilePath, vegFileBytes, { flag: 'wx' });
    await rename(temporaryVegFilePath, outputVegFilePath);
  } finally {
    await rm(temporaryVegFilePath, { force: true });
  }
}
