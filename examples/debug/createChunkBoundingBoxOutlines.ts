import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';

import type { ChunkBoundingBoxes } from '../../src/index.js';

const BOX_EDGES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
] as const;

export function createChunkBoundingBoxOutlines(
  chunkBoundingBoxes: ChunkBoundingBoxes,
): LineSegments {
  const positions: number[] = [];

  for (let chunkIndex = 0; chunkIndex < chunkBoundingBoxes.storedChunkCount; chunkIndex += 1) {
    const offset = chunkIndex * 6;
    const minX = chunkBoundingBoxes.minMaxCoordinates[offset]!;
    const minY = chunkBoundingBoxes.minMaxCoordinates[offset + 1]!;
    const minZ = chunkBoundingBoxes.minMaxCoordinates[offset + 2]!;
    const maxX = chunkBoundingBoxes.minMaxCoordinates[offset + 3]!;
    const maxY = chunkBoundingBoxes.minMaxCoordinates[offset + 4]!;
    const maxZ = chunkBoundingBoxes.minMaxCoordinates[offset + 5]!;
    const corners = [
      [minX, minY, minZ],
      [maxX, minY, minZ],
      [maxX, maxY, minZ],
      [minX, maxY, minZ],
      [minX, minY, maxZ],
      [maxX, minY, maxZ],
      [maxX, maxY, maxZ],
      [minX, maxY, maxZ],
    ];

    for (let edgeIndex = 0; edgeIndex < BOX_EDGES.length; edgeIndex += 1) {
      positions.push(...corners[BOX_EDGES[edgeIndex]!]!);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.7,
  });
  const outlines = new LineSegments(geometry, material);
  outlines.name = 'debug/chunk-bounding-box-outlines';
  outlines.frustumCulled = false;
  return outlines;
}
