import {
  Float32BufferAttribute,
  InstancedBufferGeometry,
} from 'three';

const BLADE_HALF_WIDTH = 0.5;
const VERTICES_PER_BLADE_ROW = 2;

/** Creates the shared vertical blade strip used by one candidate-capacity draw. */
export function createGrassBladeGeometry(bladeSegmentCount: number): InstancedBufferGeometry {
  const bladeGeometry = new InstancedBufferGeometry();
  const bladeVertexPositions: number[] = [];
  const bladeTriangleIndices: number[] = [];

  for (let bladeRowIndex = 0; bladeRowIndex <= bladeSegmentCount; bladeRowIndex += 1) {
    const bladeHeightRatio = bladeRowIndex / bladeSegmentCount;
    bladeVertexPositions.push(
      -BLADE_HALF_WIDTH,
      bladeHeightRatio,
      0,
      BLADE_HALF_WIDTH,
      bladeHeightRatio,
      0,
    );
  }

  for (let bladeSegmentIndex = 0;
    bladeSegmentIndex < bladeSegmentCount;
    bladeSegmentIndex += 1) {
    const lowerLeftVertexIndex = bladeSegmentIndex * VERTICES_PER_BLADE_ROW;
    const lowerRightVertexIndex = lowerLeftVertexIndex + 1;
    const upperLeftVertexIndex = lowerLeftVertexIndex + VERTICES_PER_BLADE_ROW;
    const upperRightVertexIndex = upperLeftVertexIndex + 1;
    bladeTriangleIndices.push(
      lowerLeftVertexIndex,
      lowerRightVertexIndex,
      upperRightVertexIndex,
      lowerLeftVertexIndex,
      upperRightVertexIndex,
      upperLeftVertexIndex,
    );
  }

  bladeGeometry.setAttribute(
    'position',
    new Float32BufferAttribute(bladeVertexPositions, 3),
  );
  bladeGeometry.setIndex(bladeTriangleIndices);
  bladeGeometry.instanceCount = 0;
  return bladeGeometry;
}
