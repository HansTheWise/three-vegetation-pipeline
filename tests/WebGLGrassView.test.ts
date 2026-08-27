import { Color, GLSL3, Vector3, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';
import {
  createVegetationRuntimeDataset,
  grassFragmentShader,
  grassVertexShader,
  WebGLGrassView,
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
        maxY: 4,
        maxZ: 20,
      },
      coordinateSystem: {
        upAxis: 'y',
        horizontalAxes: ['x', 'z'],
        unitsPerMeter: 2,
      },
      grid: {
        width: 2,
        height: 1,
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
    chunkLookup: Int32Array.from([0, 1]),
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

function createAdapter(): WebGLVegetationAdapter {
  return new WebGLVegetationAdapter(
    createRenderer(),
    createVegetationRuntimeDataset(
      createParsedFile(),
      icakaVegetationRuntimeConfig,
    ),
  );
}

describe('WebGLGrassView', () => {
  it('creates six-vertex near blades and four-vertex far strips', () => {
    const view = new WebGLGrassView(createAdapter(), 0);

    expect(view.geometry.getAttribute('position').count).toBe(6);
    expect(view.geometry.index!.count).toBe(12);
    expect(view.lodDraws.map((draw) => ({
      segments: draw.bladeSegments,
      vertices: draw.geometry.getAttribute('position').count,
      triangles: draw.geometry.index!.count / 3,
    }))).toEqual([
      { segments: 2, vertices: 6, triangles: 4 },
      { segments: 2, vertices: 6, triangles: 4 },
      { segments: 2, vertices: 6, triangles: 4 },
      { segments: 2, vertices: 6, triangles: 4 },
      { segments: 1, vertices: 4, triangles: 2 },
      { segments: 1, vertices: 4, triangles: 2 },
    ]);
    expect(view.material.glslVersion).toBe(GLSL3);
    expect(view.material.vertexShader).toBe(grassVertexShader);
    expect(view.material.fragmentShader).toBe(grassFragmentShader);
  });

  it('binds layer resources and converts meter values to model units', () => {
    const adapter = createAdapter();
    const view = new WebGLGrassView(adapter, 0);

    expect(view.material.uniforms.layerMask!.value)
      .toBe(adapter.staticResources.layerMasks[0]!.texture);
    expect(view.material.uniforms.patternPositions!.value)
      .toBe(adapter.staticResources.patterns[0]!.texture);
    const bladeConfig = icakaVegetationRuntimeConfig.layers[0]!;
    expect(view.material.uniforms.bladeHeight!.value.toArray()).toEqual([
      bladeConfig.blade.heightMeters.minimum * 2,
      bladeConfig.blade.heightMeters.maximum * 2,
    ]);
    expect(view.material.uniforms.bladeWidth!.value.toArray()).toEqual([
      bladeConfig.blade.widthMeters.minimum * 2,
      bladeConfig.blade.widthMeters.maximum * 2,
    ]);
    expect(view.material.uniforms.maximumBladeOffset!.value)
      .toBe(bladeConfig.bladeCount.maximumOffsetMeters * 2);
    expect(view.material.uniforms.lodTransitionStartVisibleRatio!.value)
      .toBe(bladeConfig.bladeCount.lodTransitionStartVisibleRatio);
    expect(view.candidatesPerVisibleChunk).toBe(16);
    expect(view.lodDraws.map(({ cellCount, anchorCount, elementCount }) => ({
      cellCount,
      anchorCount,
      elementCount,
    }))).toEqual([
      { cellCount: 4, anchorCount: 4, elementCount: 1 },
      { cellCount: 4, anchorCount: 3, elementCount: 1 },
      { cellCount: 4, anchorCount: 2, elementCount: 1 },
      { cellCount: 4, anchorCount: 1, elementCount: 1 },
      { cellCount: 2, anchorCount: 1, elementCount: 1 },
      { cellCount: 1, anchorCount: 1, elementCount: 1 },
    ]);
    expect(view.lodDraws.map(({ candidatesPerTile }) => candidatesPerTile))
      .toEqual([16, 12, 8, 4, 2, 1]);
    expect(view.lodDraws.map((draw) => draw.material.uniforms.useTwoSampleHeight!.value))
      .toEqual([false, false, false, false, true, true]);
    expect(view.mesh.frustumCulled).toBe(false);
  });

  it('updates actual tile-bucket candidate counts from visible chunks', () => {
    const adapter = createAdapter();
    const view = new WebGLGrassView(adapter, 0);
    adapter.updateVisibleChunks(Uint32Array.from([1, 0]), 2);

    expect(view.geometry.instanceCount).toBe(0);
    view.updateLod({ x: 0, y: 2, z: 8 });
    expect(view.geometry.instanceCount).toBe(32);
    expect(view.visibleTileCount).toBe(2);
    expect(view.visibleCandidateCount).toBe(32);
  });

  it('contains mask, identity, placement, height and color work in the shaders', () => {
    expect(grassVertexShader).toContain('isActiveCell');
    expect(grassVertexShader).toContain('vegetationCellHash');
    expect(grassVertexShader).toContain('vegetationAnchorHash');
    expect(grassVertexShader).toContain('vegetationElementHash');
    expect(grassVertexShader).toContain('interpolateHeight');
    expect(grassVertexShader).toContain('patternPositions');
    expect(grassVertexShader).toContain('visibleTileRecords');
    expect(grassVertexShader).toContain('selectTileCell');
    expect(grassVertexShader).toContain('nextCellCount');
    expect(grassVertexShader).toContain('lodFadeRange');
    expect(grassVertexShader).not.toContain('for (int levelIndex');
    expect(grassVertexShader).toContain('bladeGrowth');
    expect(grassVertexShader).toContain('fadeOrder');
    expect(grassVertexShader).toContain('verticalBladeHeight * (1.0 - visibleBladeRatio)');
    expect(grassVertexShader).not.toContain('elementHeight * growth');
    expect(grassVertexShader).toContain('averageDiagonalHeight');
    expect(grassVertexShader).toContain('bladeThicknessDistance');
    expect(grassFragmentShader).toContain('verticalColorTransition');
    expect(grassFragmentShader).not.toContain('distanceColorNearTint');
    expect(grassFragmentShader).toContain('lightingNormalUpBias');
  });

  it('updates every LOD material from one scene-light input', () => {
    const view = new WebGLGrassView(createAdapter(), 0);
    const direction = new Vector3(1, 2, 3).normalize();
    const ambient = new Color(0.1, 0.2, 0.3);
    const direct = new Color(0.8, 0.7, 0.6);

    view.setLighting(direction, ambient, direct);

    for (const draw of view.lodDraws) {
      expect(draw.material.uniforms.directionalLightDirection!.value.toArray())
        .toEqual(direction.toArray());
      expect(draw.material.uniforms.ambientLightColor!.value).toEqual(ambient);
      expect(draw.material.uniforms.directionalLightColor!.value).toEqual(direct);
    }
  });

  it('disposes its geometry and material', () => {
    const view = new WebGLGrassView(createAdapter(), 0);
    const geometryDisposed = view.lodDraws.map(() => vi.fn());
    const materialDisposed = view.lodDraws.map(() => vi.fn());
    const tileBufferDisposed = view.lodDraws.map(() => vi.fn());
    view.lodDraws.forEach((draw, index) => {
      draw.geometry.addEventListener('dispose', geometryDisposed[index]!);
      draw.material.addEventListener('dispose', materialDisposed[index]!);
      draw.tileBuffer.texture.addEventListener('dispose', tileBufferDisposed[index]!);
    });

    view.dispose();

    geometryDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    materialDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    tileBufferDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
  });
});
