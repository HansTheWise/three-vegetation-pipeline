import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import type { VegetationExtractorOptions } from '../extractor/types.js';
import { parseVegFile } from '../../runtime/parser/VegParser.js';
import {
  compileGlbToVeg,
  type VegCompilationResult,
  type VegCompilerConfig,
} from './VegCompiler.js';
import { createBuildFingerprint, formatBuildFingerprint } from './provenance.js';

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

export type CheckVegFileOptions = Readonly<{
  inputPath: string;
  outputPath: string;
  config: VegCompilerConfig;
}>;

export type VegFileCheckResult = Readonly<{
  current: boolean;
  reason: string;
  buildFingerprint: string;
  fileByteLength: number;
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

/** Checks source/config provenance and full VEGFILE validity without extracting geometry. */
export async function checkVegFile(
  options: CheckVegFileOptions,
): Promise<VegFileCheckResult> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  const sourceBytes = await readFile(inputPath);
  const source = toArrayBuffer(sourceBytes);
  const expectedFingerprint = await createBuildFingerprint(source, options.config);
  const formattedFingerprint = formatBuildFingerprint(expectedFingerprint);

  let fileBytes: Uint8Array;
  try {
    fileBytes = await readFile(outputPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        current: false,
        reason: 'VEGFILE is missing.',
        buildFingerprint: formattedFingerprint,
        fileByteLength: 0,
      };
    }
    throw error;
  }

  let actualFingerprint: Uint8Array;
  try {
    actualFingerprint = parseVegFile(fileBytes).header.buildFingerprint;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      current: false,
      reason: `VEGFILE is invalid: ${message}`,
      buildFingerprint: formattedFingerprint,
      fileByteLength: fileBytes.byteLength,
    };
  }
  if (!equalBytes(actualFingerprint, expectedFingerprint)) {
    return {
      current: false,
      reason: 'Source model or compiler config changed.',
      buildFingerprint: formattedFingerprint,
      fileByteLength: fileBytes.byteLength,
    };
  }
  return {
    current: true,
    reason: 'VEGFILE is current.',
    buildFingerprint: formattedFingerprint,
    fileByteLength: fileBytes.byteLength,
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}

export type { VegCompilerConfig } from './VegCompiler.js';
