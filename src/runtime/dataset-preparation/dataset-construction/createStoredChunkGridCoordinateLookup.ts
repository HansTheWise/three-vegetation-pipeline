import type { ParsedVegFile } from '../../../shared/vegfile-parsing/ParsedVegFileTypes.js';

/** Builds the stored-chunk-index -> interleaved [gridX, gridY] lookup. */
export function createStoredChunkGridCoordinateLookup(file: ParsedVegFile): Uint32Array {
  const storedChunkGridCoordinateLookup = new Uint32Array(
    file.header.storedChunkCount * 2,
  );
  const { width } = file.header.grid;

  for (let logicalChunkIndex = 0; logicalChunkIndex < file.chunkLookup.length; logicalChunkIndex += 1) {
    const storedChunkIndex = file.chunkLookup[logicalChunkIndex]!;
    if (storedChunkIndex === -1) continue;

    const coordinateOffset = storedChunkIndex * 2;
    storedChunkGridCoordinateLookup[coordinateOffset] = logicalChunkIndex % width;
    storedChunkGridCoordinateLookup[coordinateOffset + 1] = Math.floor(
      logicalChunkIndex / width,
    );
  }

  return storedChunkGridCoordinateLookup;
}
