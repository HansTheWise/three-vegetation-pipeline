import { GLSL3, PerspectiveCamera, Scene, type DataTexture, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';

import {
  debugChunkFragmentShader,
  debugChunkVertexShader,
  createVegetationRuntimeDataset,
  WebGLDebugChunkView,
  WebGLVegetationAdapter,
  WebGLVegetationDebug,
  WebGLGrassView,
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
  it('uses the original VEG mask and rejects missing layers', () => {
    const adapter = new WebGLVegetationAdapter(createRenderer(), createRuntimeDataset());
    const view = new WebGLDebugChunkView(adapter);
    expect(view.material.uniforms.layerMask!.value).toBe(adapter.staticResources.layerMasks[0]!.texture);
    expect(view.material.uniforms.layerMask!.value).toBe(adapter.staticResources.layerMasks[0]!.texture);
    expect(() => new WebGLDebugChunkView(adapter, { layerId: 123 })).toThrow();
    view.dispose();
    adapter.dispose();
  });
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

// Minimal event/DOM doubles; the real DOM and shader path are checked in Vite.
class DebugElement extends EventTarget {
  dataset: Record<string, string> = {};
  style = { cssText: '' };
  textContent = '';
  type = '';
  children: DebugElement[] = [];
  parentElement: DebugElement | null = null;
  append(...children: DebugElement[]): void {
    children.forEach((child) => { child.parentElement = this; this.children.push(child); });
  }
  remove(): void {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  requestPointerLock = vi.fn(async () => undefined);
}

describe('shared WebGLVegetationDebug lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('freezes the exact culling pose/projection, reports counters and removes all owned resources', () => {
    const canvas = new DebugElement();
    const parent = new DebugElement();
    const windowEvents = new EventTarget();
    const gpuQuery = {} as WebGLQuery;
    const gpuContext = {
      QUERY_RESULT_AVAILABLE: 0x8867,
      QUERY_RESULT: 0x8866,
      getContextAttributes: () => ({ antialias: false }),
      getExtension: (name: string) => name === 'EXT_disjoint_timer_query_webgl2'
        ? { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb }
        : null,
      createQuery: vi.fn(() => gpuQuery),
      beginQuery: vi.fn(),
      endQuery: vi.fn(),
      getParameter: vi.fn(() => false),
      getQueryParameter: vi.fn((_query: WebGLQuery, parameter: number) =>
        parameter === 0x8867 ? true : 2_000_000),
      deleteQuery: vi.fn(),
    };
    const documentEvents = Object.assign(new EventTarget(), {
      pointerLockElement: null as DebugElement | null,
      exitPointerLock: vi.fn(),
      createElement: () => new DebugElement(),
    });
    vi.stubGlobal('window', windowEvents);
    vi.stubGlobal('document', documentEvents);
    vi.stubGlobal('HTMLButtonElement', DebugElement);
    const renderer = Object.assign(createRenderer(), {
      domElement: canvas,
      getDrawingBufferSize: (target: { set: (x: number, y: number) => void }) => target.set(800, 600),
      getPixelRatio: () => 1,
      getContext: () => gpuContext,
      shadowMap: { enabled: false }, info: { render: { calls: 4, triangles: 20 } },
    });
    const adapter = new WebGLVegetationAdapter(renderer, createRuntimeDataset());
    const grass = new WebGLGrassView(adapter, 0);
    const scene = new Scene();
    scene.add(grass.mesh);
    grass.mesh.position.set(30, 40, 50);
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(3, 4, 5);
    camera.lookAt(0, 0, 0);
    const renderControls = {
      antialias: true,
      shadows: false,
      dpr: 1,
      setAntialias: vi.fn(),
      setShadows: vi.fn(),
      setDpr: vi.fn(),
    };
    const view = new WebGLVegetationDebug({
      adapter, grass, camera, scene, panelParent: parent as unknown as HTMLElement,
      panelTopOffsetPx: 80, renderControls,
    });
    expect(view.cullingCamera).toBe(camera);
    expect(view.cells.mesh.parent).toBe(grass.mesh);
    expect(view.frustum.group.parent).toBe(scene);
    expect(view.cells.mesh.visible).toBe(false);
    expect(view.panel.style.cssText).toContain('top:80px');
    expect(parent.children[0]!.children[0]!.children.map((button) => button.dataset.action)).toEqual([
      'vegetation', 'cells', 'boxes', 'freeze', 'aa', 'shadows', 'dpr-0.5', 'dpr-1', 'dpr-1.5', 'dpr-2',
    ]);
    view.act('vegetation');
    expect(grass.mesh.visible).toBe(false);
    view.act('aa');
    view.act('shadows');
    view.act('dpr-0.5');
    expect(renderControls.setAntialias).toHaveBeenCalledWith(false);
    expect(renderControls.setShadows).toHaveBeenCalledWith(true);
    expect(renderControls.setDpr).toHaveBeenCalledWith(0.5);
    view.toggleCullingFreeze();
    const frozen = view.cullingCamera;
    const projection = frozen.projectionMatrix.clone();
    camera.position.set(90, 80, 70);
    camera.aspect = 2;
    camera.updateProjectionMatrix();
    view.update(0.1);
    expect(frozen.position.toArray()).toEqual([3, 4, 5]);
    expect(frozen.projectionMatrix.equals(projection)).toBe(true);
    view.toggleCullingFreeze();
    expect(view.cullingCamera).toBe(camera);
    view.recordFrame(0.5, 2);
    view.beginGpuFrame();
    view.endGpuFrame();
    view.beginGpuFrame();
    view.endGpuFrame();
    view.recordFrame(0.5, 2);
    expect(parent.children[0]!.children[1]!.textContent).toContain('Instanzen eingereicht:');
    expect(parent.children[0]!.children[1]!.textContent).toContain(
      'GPU-Renderzeit Ø: 2.00 ms · GPU-Durchsatz: 500 Bilder/s',
    );
    expect(parent.children[0]!.children[1]!.textContent).toContain('800 × 600');
    const key = new Event('keydown', { cancelable: true });
    Object.assign(key, { code: 'KeyW', repeat: false });
    const start = camera.position.clone();
    windowEvents.dispatchEvent(key);
    view.update(0.1);
    expect(camera.position.equals(start)).toBe(true);
    documentEvents.pointerLockElement = canvas;
    windowEvents.dispatchEvent(key);
    view.update(0.1);
    expect(camera.position.equals(start)).toBe(false);
    const disposed = vi.fn();
    view.cells.geometry.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(documentEvents.exitPointerLock).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
    expect(view.cells.mesh.parent).toBeNull();
    expect(view.frustum.group.parent).toBeNull();
    const afterDispose = camera.position.clone();
    windowEvents.dispatchEvent(key);
    view.update(0.1);
    expect(camera.position.equals(afterDispose)).toBe(true);
    grass.dispose();
    adapter.dispose();
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
