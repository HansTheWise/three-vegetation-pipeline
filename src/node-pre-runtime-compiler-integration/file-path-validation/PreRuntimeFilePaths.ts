import { extname, resolve } from 'node:path';

export function resolveSourceGlbFilePath(sourceGlbFilePath: string): string {
  const resolvedSourceGlbFilePath = resolve(sourceGlbFilePath);
  if (extname(resolvedSourceGlbFilePath).toLocaleLowerCase('en-US') !== '.glb') {
    throw new Error('Source GLB file must use the .glb extension.');
  }
  return resolvedSourceGlbFilePath;
}

export function resolveOutputVegFilePath(outputVegFilePath: string): string {
  const resolvedOutputVegFilePath = resolve(outputVegFilePath);
  if (extname(resolvedOutputVegFilePath).toLocaleLowerCase('en-US') !== '.veg') {
    throw new Error('Output VEGFILE must use the .veg extension.');
  }
  return resolvedOutputVegFilePath;
}

export function assertDistinctSourceAndOutputFilePaths(
  sourceGlbFilePath: string,
  outputVegFilePath: string,
): void {
  if (sourceGlbFilePath === outputVegFilePath) {
    throw new Error('Source GLB and output VEGFILE paths must be different.');
  }
}
