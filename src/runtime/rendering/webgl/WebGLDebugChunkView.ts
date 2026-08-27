import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Vector2,
  Vector3,
  type ColorRepresentation,
} from 'three';

import type { Axis } from '../../../offline/config/types.js';
import type { WebGLVegetationAdapter } from '../../gpu/webgl/WebGLVegetationAdapter.js';
import { debugChunkFragmentShader } from './shaders/debugChunkFragmentShader.js';
import { debugChunkVertexShader } from './shaders/debugChunkVertexShader.js';
import type { WebGLShaderSource } from './types.js';

export type WebGLDebugChunkViewOptions = Readonly<{
  shader?: WebGLShaderSource;
  evenChunkColor?: ColorRepresentation;
  oddChunkColor?: ColorRepresentation;
  opacity?: number;
  heightOffsetMeters?: number;
}>;

const defaultShader: WebGLShaderSource = {
  vertexShader: debugChunkVertexShader,
  fragmentShader: debugChunkFragmentShader,
};

/** Displays one flat debug tile for every chunk currently visible to the adapter. */
export class WebGLDebugChunkView {
  readonly geometry: InstancedBufferGeometry;
  readonly material: RawShaderMaterial;
  readonly mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  readonly lodAnchorCounts: Uint32Array;

  #lodLevel = 0;

  constructor(
    adapter: WebGLVegetationAdapter,
    options: WebGLDebugChunkViewOptions = {},
  ) {
    const opacity = options.opacity ?? 0.65;
    const heightOffsetMeters = options.heightOffsetMeters ?? 0.02;
    validateOptions(opacity, heightOffsetMeters);

    const { header } = adapter.staticResources;
    const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
    const shader = options.shader ?? defaultShader;
    const patternResource = adapter.staticResources.patterns[0];
    if (!patternResource) {
      throw new Error('Debug cell view requires runtime pattern resources.');
    }
    const layerMask = adapter.staticResources.layerMasks.find(
      (resource) => resource.layerId === patternResource.layerId,
    );
    if (!layerMask) {
      throw new Error(`Debug pattern layer ${patternResource.layerId} has no VEGFILE mask.`);
    }
    this.lodAnchorCounts = patternResource.patternSet.lodAnchorCounts;

    this.geometry = createChunkTileGeometry(header.heightMap.resolution);
    this.material = new RawShaderMaterial({
      name: 'vegetation/debug-visible-chunks',
      glslVersion: GLSL3,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: DoubleSide,
      transparent: opacity < 1,
      depthWrite: false,
      uniforms: {
        visibleChunkIndices: { value: adapter.visibleChunkBuffer.texture },
        storedChunkGridCoordinates: {
          value: adapter.staticResources.storedChunkGridCoordinatesTexture,
        },
        chunkHeightRanges: {
          value: adapter.staticResources.chunkHeightRangesTexture,
        },
        heightData: { value: adapter.staticResources.heightDataTexture },
        layerMask: { value: layerMask.texture },
        patternPositions: { value: patternResource.texture },
        seed: { value: header.seed },
        layerId: { value: patternResource.layerId },
        patternCount: { value: patternResource.patternSet.patternCount },
        maskResolution: { value: layerMask.maskResolution },
        visibleAnchorCount: { value: this.lodAnchorCounts[0] },
        rotatePerCell: { value: patternResource.rotatePerCell },
        reflectPerCell: { value: patternResource.reflectPerCell },
        gridOrigin: {
          value: new Vector2(header.grid.originX, header.grid.originY),
        },
        chunkSize: { value: header.grid.chunkSize },
        heightResolution: { value: header.heightMap.resolution },
        maximumQuantizedHeight: { value: (2 ** header.heightMap.valueBits) - 1 },
        horizontalAxisA: { value: createAxisVector(horizontalAxisA) },
        horizontalAxisB: { value: createAxisVector(horizontalAxisB) },
        upAxis: { value: createAxisVector(header.coordinateSystem.upAxis) },
        heightOffset: {
          value: heightOffsetMeters * header.coordinateSystem.unitsPerMeter,
        },
        evenChunkColor: { value: new Color(options.evenChunkColor ?? '#22c55e') },
        oddChunkColor: { value: new Color(options.oddChunkColor ?? '#0ea5e9') },
        opacity: { value: opacity },
      },
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'vegetation/debug-visible-chunks';
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = () => {
      this.geometry.instanceCount = adapter.visibleChunkBuffer.visibleChunkCount;
    };
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  get lodLevel(): number {
    return this.#lodLevel;
  }

  get visibleAnchorCount(): number {
    return this.lodAnchorCounts[this.#lodLevel]!;
  }

  setLodLevel(lodLevel: number): void {
    if (!Number.isInteger(lodLevel) || lodLevel < 0 || lodLevel >= this.lodAnchorCounts.length) {
      throw new Error(`Debug pattern LOD ${lodLevel} is outside the available levels.`);
    }
    this.#lodLevel = lodLevel;
    this.material.uniforms.visibleAnchorCount!.value = this.visibleAnchorCount;
  }
}

function createChunkTileGeometry(resolution: number): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  const positions = new Float32Array(resolution * resolution * 3);
  const indices: number[] = [];
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const vertexOffset = (y * resolution + x) * 3;
      positions[vertexOffset] = x / (resolution - 1);
      positions[vertexOffset + 1] = y / (resolution - 1);
    }
  }
  for (let y = 0; y + 1 < resolution; y += 1) {
    for (let x = 0; x + 1 < resolution; x += 1) {
      const lowerLeft = y * resolution + x;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + resolution;
      const upperRight = upperLeft + 1;
      indices.push(
        lowerLeft, lowerRight, upperRight,
        lowerLeft, upperRight, upperLeft,
      );
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.instanceCount = 0;
  return geometry;
}

function createAxisVector(axis: Axis): Vector3 {
  if (axis === 'x') return new Vector3(1, 0, 0);
  if (axis === 'y') return new Vector3(0, 1, 0);
  return new Vector3(0, 0, 1);
}

function validateOptions(opacity: number, heightOffsetMeters: number): void {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('Debug chunk opacity must be between 0 and 1.');
  }
  if (!Number.isFinite(heightOffsetMeters) || heightOffsetMeters < 0) {
    throw new Error('Debug chunk height offset must be a non-negative finite number.');
  }
}
