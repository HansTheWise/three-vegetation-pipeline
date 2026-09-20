import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';

import type { StoredChunkCullingBounds } from '../stored-chunk-visibility/frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';

const BOX_EDGES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
] as const;
const BOUNDS_COORDINATE_COUNT_PER_CHUNK = 6;
const POSITION_COMPONENT_COUNT = 3;
const STORED_CHUNK_OUTLINE_COLOR = '#f59e0b';
const STORED_CHUNK_OUTLINE_OPACITY = 0.7;

export function createStoredChunkCullingBoundsOutlines(
  storedChunkCullingBounds: StoredChunkCullingBounds,
): LineSegments {
  const positions: number[] = [];

  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCullingBounds.storedChunkCount; storedChunkIndex += 1) {
    const offset = storedChunkIndex * BOUNDS_COORDINATE_COUNT_PER_CHUNK;
    const coordinates = storedChunkCullingBounds.minimumMaximumCoordinates;
    const minX = coordinates[offset]!;
    const minY = coordinates[offset + 1]!;
    const minZ = coordinates[offset + 2]!;
    const maxX = coordinates[offset + 3]!;
    const maxY = coordinates[offset + 4]!;
    const maxZ = coordinates[offset + 5]!;
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
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(positions, POSITION_COMPONENT_COUNT),
  );
  const material = new LineBasicMaterial({
    color: STORED_CHUNK_OUTLINE_COLOR,
    transparent: true,
    opacity: STORED_CHUNK_OUTLINE_OPACITY,
  });
  const outlines = new LineSegments(geometry, material);
  outlines.name = 'debug/chunk-bounding-box-outlines';
  outlines.frustumCulled = false;
  return outlines;
}
