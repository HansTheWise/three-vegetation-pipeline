import type { ParsedVegFile } from '../parser/types.js';

/**
 * Builds interleaved [gridX, gridY] pairs indexed by stored chunk index.
 */
export function createStoredChunkGridCoordinates(file: ParsedVegFile): Uint32Array {
  const coordinates = new Uint32Array(file.header.storedChunkCount * 2);
  const { width } = file.header.grid;

  for (let logicalChunkIndex = 0; logicalChunkIndex < file.chunkLookup.length; logicalChunkIndex += 1) {
    const storedChunkIndex = file.chunkLookup[logicalChunkIndex]!;
    if (storedChunkIndex === -1) continue;

    const coordinateOffset = storedChunkIndex * 2;
    coordinates[coordinateOffset] = logicalChunkIndex % width;
    coordinates[coordinateOffset + 1] = Math.floor(logicalChunkIndex / width);
  }

  return coordinates;
}
