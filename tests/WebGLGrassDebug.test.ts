import { GLSL3, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';

import {
  grassChunkCellDebugFragmentShader,
  grassChunkCellDebugVertexShader,
  createVegetationRuntimeDataset,
  grassLayerPreparation,
  requireGrassRuntimeLayer,
  WebGLGrassChunkCellDebugView,
  WebGLGrassLayerRenderer,
  WebGLSharedVegetationResources,
  WebGLGrassDebug,
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
      version: 2,
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
  return createVegetationRuntimeDataset(
    createParsedFile(),
    vegetationRuntimeConfig,
    [grassLayerPreparation],
  );
}

function createGrassLayerRenderer(
  sharedResources: WebGLSharedVegetationResources,
): WebGLGrassLayerRenderer {
  return new WebGLGrassLayerRenderer({
    sharedResources,
    layer: requireGrassRuntimeLayer(sharedResources.dataset.preparedLayers[0]!),
  });
}

describe('WebGLGrassChunkCellDebugView', () => {
  it('uses the original VEG mask and rejects missing layers', () => {
    const sharedResources = new WebGLSharedVegetationResources(
      createRenderer(),
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);
    const view = new WebGLGrassChunkCellDebugView(
      sharedResources,
      grassRenderer.layerResources,
    );
    expect(view.material.uniforms.layerMask!.value).toBe(view.layerMaskTexture);
    expect(sharedResources.vegFileTextures).not.toHaveProperty('layerMasks');
    expect(() => new WebGLGrassChunkCellDebugView(sharedResources, {
      layerId: 123,
      pattern: grassRenderer.layerResources.pattern,
    })).toThrow('has no VEGFILE mask');
    view.dispose();
    grassRenderer.dispose();
    sharedResources.dispose();
  });
  it('binds shared textures and model-local grid metadata to the debug material', () => {
    const sharedResources = new WebGLSharedVegetationResources(
      createRenderer(),
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);
    const view = new WebGLGrassChunkCellDebugView(sharedResources, grassRenderer.layerResources, {
      opacity: 0.5,
      heightOffsetMeters: 0.25,
    });

    expect(view.material.glslVersion).toBe(GLSL3);
    expect(view.material.vertexShader).toBe(grassChunkCellDebugVertexShader);
    expect(view.material.fragmentShader).toBe(grassChunkCellDebugFragmentShader);
    expect(view.material.uniforms.visibleStoredChunkIndices!.value)
      .toBe(sharedResources.visibleStoredChunkTexture.texture);
    expect(view.material.uniforms.storedChunkGridCoordinates!.value)
      .toBe(sharedResources.vegFileTextures.storedChunkGridCoordinatesTexture);
    expect(view.material.uniforms.chunkHeightRanges!.value)
      .toBe(sharedResources.vegFileTextures.chunkHeightRangesTexture);
    expect(view.material.uniforms.heightData!.value)
      .toBe(sharedResources.vegFileTextures.heightDataTexture);
    expect(view.material.uniforms.patternPositions!.value)
      .toBe(grassRenderer.layerResources.pattern.texture);
    expect(view.material.uniforms.visibleAnchorCount!.value).toBe(4);
    expect(view.material.uniforms.gridOrigin!.value.toArray()).toEqual([-5, 3]);
    expect(view.material.uniforms.chunkSize!.value).toBe(10);
    expect(view.material.uniforms.horizontalAxisA!.value.toArray()).toEqual([1, 0, 0]);
    expect(view.material.uniforms.horizontalAxisB!.value.toArray()).toEqual([0, 1, 0]);
    expect(view.material.uniforms.upAxis!.value.toArray()).toEqual([0, 0, 1]);
    expect(view.material.uniforms.heightOffset!.value).toBe(0.5);
    expect(view.mesh.frustumCulled).toBe(false);
  });

  it('updates the draw instance count from shared visibility before rendering', () => {
    const sharedResources = new WebGLSharedVegetationResources(
      createRenderer(),
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);
    const view = new WebGLGrassChunkCellDebugView(
      sharedResources,
      grassRenderer.layerResources,
    );
    sharedResources.visibleStoredChunkTexture.update(Uint32Array.from([1, 0]), 2);

    expect(view.geometry.instanceCount).toBe(0);
    (view.mesh.onBeforeRender as () => void)();
    expect(view.geometry.instanceCount).toBe(2);
  });

  it('accepts replacement shader sources', () => {
    const sharedResources = new WebGLSharedVegetationResources(
      createRenderer(),
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);
    const view = new WebGLGrassChunkCellDebugView(sharedResources, grassRenderer.layerResources, {
      shader: {
        vertexShader: 'custom vertex shader',
        fragmentShader: 'custom fragment shader',
      },
    });

    expect(view.material.vertexShader).toBe('custom vertex shader');
    expect(view.material.fragmentShader).toBe('custom fragment shader');
  });

  it('disposes its geometry and material', () => {
    const sharedResources = new WebGLSharedVegetationResources(
      createRenderer(),
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);
    const view = new WebGLGrassChunkCellDebugView(
      sharedResources,
      grassRenderer.layerResources,
    );
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const layerMaskTextureDisposed = vi.fn();
    view.geometry.addEventListener('dispose', geometryDisposed);
    view.material.addEventListener('dispose', materialDisposed);
    view.layerMaskTexture.addEventListener('dispose', layerMaskTextureDisposed);

    view.dispose();

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(layerMaskTextureDisposed).toHaveBeenCalledOnce();
  });

  it('rejects invalid display options', () => {
    const sharedResources = new WebGLSharedVegetationResources(
      createRenderer(),
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);

    expect(() => new WebGLGrassChunkCellDebugView(
      sharedResources,
      grassRenderer.layerResources,
      { opacity: 2 },
    )).toThrow(
      'Grass chunk Cell debug opacity must be between 0 and 1.',
    );
    expect(() => new WebGLGrassChunkCellDebugView(
      sharedResources,
      grassRenderer.layerResources,
      { heightOffsetMeters: -1 },
    )).toThrow(
      'Grass chunk Cell debug height offset must be a non-negative finite number.',
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

describe('WebGLGrassDebug lifecycle', () => {
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
    const sharedResources = new WebGLSharedVegetationResources(
      renderer,
      createRuntimeDataset(),
    );
    const grassRenderer = createGrassLayerRenderer(sharedResources);
    const scene = new Scene();
    scene.add(grassRenderer.object3d);
    grassRenderer.object3d.position.set(30, 40, 50);
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
    const view = new WebGLGrassDebug({
      sharedResources,
      grassRenderer,
      camera,
      scene,
      panelParent: parent as unknown as HTMLElement,
      panelTopOffsetPx: 80, renderControls,
    });
    expect(view.cullingCamera).toBe(camera);
    expect(view.grassChunkCellView.mesh.parent).toBe(grassRenderer.object3d);
    expect(view.cullingFrustumVisualization.group.parent).toBe(scene);
    expect(view.grassChunkCellView.mesh.visible).toBe(false);
    expect(view.debugPanelElement.style.cssText).toContain('top:80px');
    expect(parent.children[0]!.children[0]!.children.map((button) => button.dataset.action)).toEqual([
      'vegetation', 'cells', 'boxes', 'freeze', 'aa', 'shadows', 'dpr-0.5', 'dpr-1', 'dpr-1.5', 'dpr-2',
    ]);
    view.executeDebugAction('vegetation');
    expect(grassRenderer.object3d.visible).toBe(false);
    view.executeDebugAction('aa');
    view.executeDebugAction('shadows');
    view.executeDebugAction('dpr-0.5');
    expect(renderControls.setAntialias).toHaveBeenCalledWith(false);
    expect(renderControls.setShadows).toHaveBeenCalledWith(true);
    expect(renderControls.setDpr).toHaveBeenCalledWith(0.5);
    view.toggleCullingFreeze();
    const frozen = view.cullingCamera;
    const projection = frozen.projectionMatrix.clone();
    camera.position.set(90, 80, 70);
    camera.aspect = 2;
    camera.updateProjectionMatrix();
    view.updateCameraController(0.1);
    expect(frozen.position.toArray()).toEqual([3, 4, 5]);
    expect(frozen.projectionMatrix.equals(projection)).toBe(true);
    view.toggleCullingFreeze();
    expect(view.cullingCamera).toBe(camera);
    view.recordFrameDiagnostics(0.5, 2);
    view.beginGpuFrameMeasurement();
    view.endGpuFrameMeasurement();
    view.beginGpuFrameMeasurement();
    view.endGpuFrameMeasurement();
    view.recordFrameDiagnostics(0.5, 2);
    expect(parent.children[0]!.children[1]!.textContent).toContain('Instanzen eingereicht:');
    expect(parent.children[0]!.children[1]!.textContent).toContain(
      'GPU-Renderzeit Ø: 2.00 ms · GPU-Durchsatz: 500 Bilder/s',
    );
    expect(parent.children[0]!.children[1]!.textContent).toContain('800 × 600');
    const key = new Event('keydown', { cancelable: true });
    Object.assign(key, { code: 'KeyW', repeat: false });
    const start = camera.position.clone();
    windowEvents.dispatchEvent(key);
    view.updateCameraController(0.1);
    expect(camera.position.equals(start)).toBe(true);
    documentEvents.pointerLockElement = canvas;
    windowEvents.dispatchEvent(key);
    view.updateCameraController(0.1);
    expect(camera.position.equals(start)).toBe(false);
    const disposed = vi.fn();
    view.grassChunkCellView.geometry.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(documentEvents.exitPointerLock).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
    expect(view.grassChunkCellView.mesh.parent).toBeNull();
    expect(view.cullingFrustumVisualization.group.parent).toBeNull();
    const afterDispose = camera.position.clone();
    windowEvents.dispatchEvent(key);
    view.updateCameraController(0.1);
    expect(camera.position.equals(afterDispose)).toBe(true);
    grassRenderer.dispose();
    sharedResources.dispose();
  });
});

describe('debug chunk shaders', () => {
  it('reads visible chunks, grid coordinates, and height ranges in the vertex shader', () => {
    expect(grassChunkCellDebugVertexShader).toContain('gl_InstanceID');
    expect(grassChunkCellDebugVertexShader).toContain('visibleStoredChunkIndices');
    expect(grassChunkCellDebugVertexShader).toContain('storedChunkGridCoordinates');
    expect(grassChunkCellDebugVertexShader).toContain('chunkHeightRanges');
    expect(grassChunkCellDebugVertexShader).toContain('heightData');
    expect(grassChunkCellDebugVertexShader).toContain('texelFetch');
  });

  it('reads cell masks, pattern anchors, rotation and reflection in the fragment shader', () => {
    expect(grassChunkCellDebugFragmentShader).toContain('layerMask');
    expect(grassChunkCellDebugFragmentShader).toContain('patternPositions');
    expect(grassChunkCellDebugFragmentShader).toContain('visibleAnchorCount');
    expect(grassChunkCellDebugFragmentShader).toContain('rotatePerCell');
    expect(grassChunkCellDebugFragmentShader).toContain('reflectPerCell');
  });
});
