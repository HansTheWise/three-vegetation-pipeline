import {
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  RedIntegerFormat,
  UnsignedIntType,
  Vector2,
  Vector3,
  type ColorRepresentation,
} from 'three';

import type { Axis } from '../../../offline/offline-compilation-orchestration/VegetationCompilerConfig.js';
import type { WebGLSharedVegetationResources } from '../../../runtime/webgl-vegetation-resource-management/WebGLSharedVegetationResources.js';
import {
  calculateWebGLDataTextureLayout,
  padWebGLDataTextureArray,
} from '../../../runtime/webgl-vegetation-resource-management/data-texture-layout/WebGLDataTextureLayout.js';
import type { WebGLGrassLayerResources } from '../grass-webgl-rendering/WebGLGrassLayerResources.js';
import { grassChunkCellDebugFragmentShader } from './shaders/grassChunkCellDebugFragmentShader.js';
import { grassChunkCellDebugVertexShader } from './shaders/grassChunkCellDebugVertexShader.js';
import type { WebGLShaderSource } from '../../../runtime/vegetation-layer-rendering-contracts/WebGLShaderSource.js';

export type WebGLGrassChunkCellDebugViewOptions = Readonly<{
  shader?: WebGLShaderSource;
  evenChunkColor?: ColorRepresentation;
  oddChunkColor?: ColorRepresentation;
  opacity?: number;
  heightOffsetMeters?: number;
}>;

const DEFAULT_SURFACE_OPACITY = 0.65;
const DEFAULT_HEIGHT_OFFSET_METERS = 0.02;
const DEFAULT_EVEN_PATTERN_COLOR = '#22c55e';
const DEFAULT_ODD_PATTERN_COLOR = '#0ea5e9';
const POSITION_COMPONENT_COUNT = 3;

const DEFAULT_GRASS_CHUNK_CELL_DEBUG_SHADER: WebGLShaderSource = {
  vertexShader: grassChunkCellDebugVertexShader,
  fragmentShader: grassChunkCellDebugFragmentShader,
};

/** Displays the Grass Cell mask and deterministic anchors over visible stored chunks. */
export class WebGLGrassChunkCellDebugView {
  readonly geometry: InstancedBufferGeometry;
  readonly material: RawShaderMaterial;
  readonly mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  readonly layerMaskTexture: DataTexture;

  constructor(
    sharedResources: WebGLSharedVegetationResources,
    grassResources: Pick<WebGLGrassLayerResources, 'layerId' | 'pattern'>,
    options: WebGLGrassChunkCellDebugViewOptions = {},
  ) {
    const opacity = options.opacity ?? DEFAULT_SURFACE_OPACITY;
    const heightOffsetMeters = options.heightOffsetMeters ?? DEFAULT_HEIGHT_OFFSET_METERS;
    validateOptions(opacity, heightOffsetMeters);

    const { header } = sharedResources.dataset.file;
    const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
    const shader = options.shader ?? DEFAULT_GRASS_CHUNK_CELL_DEBUG_SHADER;
    const grassPatternResource = grassResources.pattern;
    const grassFileLayer = sharedResources.dataset.file.layers.find(
      (layer) => layer.id === grassResources.layerId,
    );
    if (!grassFileLayer) {
      throw new Error(`Grass debug layer ${grassResources.layerId} has no VEGFILE mask.`);
    }
    this.layerMaskTexture = createUploadedGrassLayerMaskTexture(
      sharedResources,
      grassFileLayer.maskData,
      grassFileLayer.maskWordsPerChunk * header.storedChunkCount,
      grassResources.layerId,
    );
    this.geometry = createStoredChunkHeightSurfaceGeometry(header.heightMap.resolution);
    this.material = new RawShaderMaterial({
      name: 'vegetation/debug-visible-chunks',
      glslVersion: GLSL3,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: DoubleSide,
      transparent: opacity < 1,
      depthWrite: false,
      uniforms: {
        visibleStoredChunkIndices: {
          value: sharedResources.visibleStoredChunkTexture.texture,
        },
        storedChunkGridCoordinates: {
          value: sharedResources.vegFileTextures.storedChunkGridCoordinatesTexture,
        },
        chunkHeightRanges: {
          value: sharedResources.vegFileTextures.chunkHeightRangesTexture,
        },
        heightData: { value: sharedResources.vegFileTextures.heightDataTexture },
        layerMask: { value: this.layerMaskTexture },
        patternPositions: { value: grassPatternResource.texture },
        seed: { value: header.seed },
        layerId: { value: grassResources.layerId },
        patternCount: { value: grassPatternResource.patternSet.patternCount },
        maskResolution: { value: grassFileLayer.maskResolution },
        visibleAnchorCount: { value: grassPatternResource.patternSet.anchorsPerPattern },
        rotatePerCell: { value: grassPatternResource.rotatePerCell },
        reflectPerCell: { value: grassPatternResource.reflectPerCell },
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
        evenChunkColor: {
          value: new Color(options.evenChunkColor ?? DEFAULT_EVEN_PATTERN_COLOR),
        },
        oddChunkColor: {
          value: new Color(options.oddChunkColor ?? DEFAULT_ODD_PATTERN_COLOR),
        },
        opacity: { value: opacity },
      },
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'vegetation/debug-visible-chunks';
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = () => {
      this.geometry.instanceCount = sharedResources
        .visibleStoredChunkTexture.visibleStoredChunkCount;
    };
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.layerMaskTexture.dispose();
  }

}

function createUploadedGrassLayerMaskTexture(
  sharedResources: WebGLSharedVegetationResources,
  maskData: Uint32Array,
  maskWordCount: number,
  layerId: number,
): DataTexture {
  const textureName = `vegetation/debug-layer-${layerId}-mask`;
  const layout = calculateWebGLDataTextureLayout(
    maskWordCount,
    sharedResources.renderer.capabilities.maxTextureSize,
    textureName,
  );
  const textureData = padWebGLDataTextureArray(maskData, layout.texelCapacity);
  const texture = new DataTexture(
    textureData,
    layout.width,
    layout.height,
    RedIntegerFormat,
    UnsignedIntType,
  );
  texture.name = textureName;
  texture.needsUpdate = true;
  try {
    sharedResources.renderer.initTexture(texture);
  } catch (error) {
    texture.dispose();
    throw error;
  }
  return texture;
}

function createStoredChunkHeightSurfaceGeometry(resolution: number): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  const positions = new Float32Array(resolution * resolution * POSITION_COMPONENT_COUNT);
  const indices: number[] = [];
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const vertexOffset = (y * resolution + x) * POSITION_COMPONENT_COUNT;
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
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(positions, POSITION_COMPONENT_COUNT),
  );
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
    throw new Error('Grass chunk Cell debug opacity must be between 0 and 1.');
  }
  if (!Number.isFinite(heightOffsetMeters) || heightOffsetMeters < 0) {
    throw new Error(
      'Grass chunk Cell debug height offset must be a non-negative finite number.',
    );
  }
}
