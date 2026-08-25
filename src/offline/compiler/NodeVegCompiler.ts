import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import type { VegetationExtractorOptions } from '../extractor/types.js';
import {
  compileGlbToVeg,
  type VegCompilationResult,
  type VegCompilerConfig,
} from './VegCompiler.js';

export type CreateVegFileOptions = Readonly<{
  inputPath: string;
  outputPath: string;
  config: VegCompilerConfig;
  extractorOptions?: VegetationExtractorOptions;
}>;

export type CreatedVegFile = VegCompilationResult & Readonly<{
  inputPath: string;
  outputPath: string;
}>;

/** Compiles a GLB and atomically replaces the requested .veg output file. */
export async function createVegFile(
  options: CreateVegFileOptions,
): Promise<CreatedVegFile> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  if (inputPath === outputPath) throw new Error('Input and output paths must be different.');
  if (extname(inputPath).toLocaleLowerCase('en-US') !== '.glb') {
    throw new Error('Input file must use the .glb extension.');
  }
  if (extname(outputPath).toLocaleLowerCase('en-US') !== '.veg') {
    throw new Error('Output file must use the .veg extension.');
  }

  const sourceBytes = await readFile(inputPath);
  const source = sourceBytes.buffer.slice(
    sourceBytes.byteOffset,
    sourceBytes.byteOffset + sourceBytes.byteLength,
  ) as ArrayBuffer;
  const result = await compileGlbToVeg(
    source,
    options.config,
    options.extractorOptions,
  );

  const outputDirectory = dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true });
  const temporaryPath = resolve(
    outputDirectory,
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, result.file, { flag: 'wx' });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return { ...result, inputPath, outputPath };
}
