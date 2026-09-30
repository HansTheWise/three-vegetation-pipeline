#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  generateNodeVegFile,
} from '../dist/node-pre-runtime-compiler-integration/index.js';
import {
  formatVegFileBuildFingerprint,
} from '../dist/pre-runtime-compiler-core/VegFileBuildFingerprint.js';

const HELP = `Usage:
  veg-compile --input <model.glb> --config <config.js|config.ts> --output <asset.veg>

Options:
  -i, --input    Source GLB file
  -c, --config   ES module with the pipeline config as its default export
  -o, --output   Target VEGFILE
  -h, --help     Show this help
`;

try {
  const argumentsByName = parseArguments(process.argv.slice(2));
  if (argumentsByName.help) {
    process.stdout.write(HELP);
  } else {
    const configPath = resolve(requiredArgument(argumentsByName, 'config'));
    const configModule = await import(pathToFileURL(configPath).href);
    if (!configModule.default || typeof configModule.default !== 'object') {
      throw new Error('Config module must provide the pipeline config as its default export.');
    }
    const result = await generateNodeVegFile({
      sourceGlbFilePath: requiredArgument(argumentsByName, 'input'),
      outputVegFilePath: requiredArgument(argumentsByName, 'output'),
      vegetationCompilerConfig: configModule.default,
    });
    printReport(result);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`veg-compile: ${message}\n\n${HELP}`);
  process.exitCode = 1;
}

function parseArguments(values) {
  const result = {};
  const names = new Map([
    ['-i', 'input'], ['--input', 'input'],
    ['-c', 'config'], ['--config', 'config'],
    ['-o', 'output'], ['--output', 'output'],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--') continue;
    if (value === '-h' || value === '--help') {
      result.help = true;
      continue;
    }
    const name = names.get(value);
    if (!name) throw new Error(`Unknown argument "${value}".`);
    const argumentValue = values[index + 1];
    if (!argumentValue || argumentValue.startsWith('-')) {
      throw new Error(`Argument "${value}" requires a value.`);
    }
    if (result[name] !== undefined) throw new Error(`Argument "${value}" was provided twice.`);
    result[name] = argumentValue;
    index += 1;
  }
  return result;
}

function requiredArgument(argumentsByName, name) {
  const value = argumentsByName[name];
  if (!value) throw new Error(`Missing required argument "--${name}".`);
  return value;
}

function printReport(result) {
  const lines = [
    'VEGFILE created successfully',
    `Input: ${result.sourceGlbFilePath}`,
    `Output: ${result.outputVegFilePath}`,
    `Build fingerprint: ${formatVegFileBuildFingerprint(result.buildFingerprint)}`,
    `File size: ${result.vegFileBytes.byteLength} bytes`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
