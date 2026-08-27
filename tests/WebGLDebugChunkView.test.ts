import { GLSL3, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';

import {
  debugChunkFragmentShader,
  debugChunkVertexShader,
  createVegetationRuntimeDataset,
  WebGLDebugChunkView,
  WebGLVegetationAdapter,
  type ParsedVegFile,
} from '../src/index.js';

function createRenderer(): WebGLRenderer {
  return {
    capabilities: { maxTextureSize: 4096 },
    initTexture: vi.fn(),
  } as unknown as WebGLRenderer;
}

function createParsedFile(): ParsedVegFile {
  return {
    bytes: new Uint8Array(),
    header: {
      version: 1,
      fileSize: 0,
      seed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 20,
        maxY: 20,
        maxZ: 4,
      },
      coordinateSystem: {
        upAxis: 'z',
        horizontalAxes: ['x', 'y'],
        unitsPerMeter: 2,
      },
      grid: {
        width: 2,
        height: 2,
        chunkSize: 10,
        originX: -5,
        originY: 3,
      },
      storedChunkCount: 2,
      heightMap: {
        resolution: 2,
        valueBits: 16,
        valuesPerChunk: 4,
      },
    },
    chunkLookup: Int32Array.from([0, -1, -1, 1]),
    chunkHeightRanges: Float32Array.from([1, 2, 3, 4]),
    heightData: Uint16Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
    layers: [{
      id: 0,
      maskResolution: 2,
      maskWordsPerChunk: 1,
      maskData: Uint32Array.from([0b1111, 0b0011]),
    }],
  };
}

function createRuntimeDataset() {
  return createVegetationRuntimeDataset(createParsedFile(), icakaVegetationRuntimeConfig);
}

describe('WebGLDebugChunkView', () => {
  it('binds adapter textures and model-local grid metadata to the debug material', () => {
    const adapter = new WebGLVegetationAdapter(
      createRenderer(),
      createRuntimeDataset(),
    );
    const view = new WebGLDebugChunkView(adapter, {
      opacity: 0.5,
      heightOffsetMeters: 0.25,
    });

    expect(view.material.glslVersion).toBe(GLSL3);
    expect(view.material.vertexShader).toBe(debugChunkVertexShader);
    expect(view.material.fragmentShader).toBe(debugChunkFragmentShader);
    expect(view.material.uniforms.visibleChunkIndices!.value)
      .toBe(adapter.visibleChunkBuffer.texture);
    expect(view.material.uniforms.storedChunkGridCoordinates!.value)
      .toBe(adapter.staticResources.storedChunkGridCoordinatesTexture);
    expect(view.material.uniforms.chunkHeightRanges!.value)
      .toBe(adapter.staticResources.chunkHeightRangesTexture);
    expect(view.material.uniforms.heightData!.value)
      .toBe(adapter.staticResources.heightDataTexture);
    expect(view.material.uniforms.patternPositions!.value)
      .toBe(adapter.staticResources.patterns[0]!.texture);
    expect(view.material.uniforms.visibleAnchorCount!.value).toBe(4);
    expect(view.material.uniforms.gridOrigin!.value.toArray()).toEqual([-5, 3]);
    expect(view.material.uniforms.chunkSize!.value).toBe(10);
    expect(view.material.uniforms.horizontalAxisA!.value.toArray()).toEqual([1, 0, 0]);
    expect(view.material.uniforms.horizontalAxisB!.value.toArray()).toEqual([0, 1, 0]);
    expect(view.material.uniforms.upAxis!.value.toArray()).toEqual([0, 0, 1]);
    expect(view.material.uniforms.heightOffset!.value).toBe(0.5);
    expect(view.mesh.frustumCulled).toBe(false);
  });

  it('updates the draw instance count from the adapter before rendering', () => {
    const adapter = new WebGLVegetationAdapter(
      createRenderer(),
      createRuntimeDataset(),
    );
    const view = new WebGLDebugChunkView(adapter);
    adapter.updateVisibleChunks(Uint32Array.from([1, 0]), 2);

    expect(view.geometry.instanceCount).toBe(0);
    (view.mesh.onBeforeRender as () => void)();
    expect(view.geometry.instanceCount).toBe(2);
  });

  it('accepts replacement shader sources', () => {
    const adapter = new WebGLVegetationAdapter(
      createRenderer(),
      createRuntimeDataset(),
    );
    const view = new WebGLDebugChunkView(adapter, {
      shader: {
        vertexShader: 'custom vertex shader',
        fragmentShader: 'custom fragment shader',
      },
    });

    expect(view.material.vertexShader).toBe('custom vertex shader');
    expect(view.material.fragmentShader).toBe('custom fragment shader');
  });

  it('disposes its geometry and material', () => {
    const adapter = new WebGLVegetationAdapter(
      createRenderer(),
      createRuntimeDataset(),
    );
    const view = new WebGLDebugChunkView(adapter);
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    view.geometry.addEventListener('dispose', geometryDisposed);
    view.material.addEventListener('dispose', materialDisposed);

    view.dispose();

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
  });

  it('rejects invalid display options', () => {
    const adapter = new WebGLVegetationAdapter(
      createRenderer(),
      createRuntimeDataset(),
    );

    expect(() => new WebGLDebugChunkView(adapter, { opacity: 2 })).toThrow(
      'Debug chunk opacity must be between 0 and 1.',
    );
    expect(() => new WebGLDebugChunkView(adapter, { heightOffsetMeters: -1 })).toThrow(
      'Debug chunk height offset must be a non-negative finite number.',
    );
  });
});

describe('debug chunk shaders', () => {
  it('reads visible chunks, grid coordinates, and height ranges in the vertex shader', () => {
    expect(debugChunkVertexShader).toContain('gl_InstanceID');
    expect(debugChunkVertexShader).toContain('visibleChunkIndices');
    expect(debugChunkVertexShader).toContain('storedChunkGridCoordinates');
    expect(debugChunkVertexShader).toContain('chunkHeightRanges');
    expect(debugChunkVertexShader).toContain('heightData');
    expect(debugChunkVertexShader).toContain('texelFetch');
  });

  it('reads cell masks, pattern anchors, rotation and reflection in the fragment shader', () => {
    expect(debugChunkFragmentShader).toContain('layerMask');
    expect(debugChunkFragmentShader).toContain('patternPositions');
    expect(debugChunkFragmentShader).toContain('visibleAnchorCount');
    expect(debugChunkFragmentShader).toContain('rotatePerCell');
    expect(debugChunkFragmentShader).toContain('reflectPerCell');
  });
});
