import { Color, GLSL3, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import { groundColorConfig } from './fixtures/groundColorConfig.js';
import {
  createVegetationRuntimeDataset,
  grassFragmentShader,
  grassVertexShader,
  WebGLGrassView,
  WebGLVegetationAdapter,
  type ParsedVegFile,
  type VegetationRuntimeConfig,
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
      sourceBounds: { minX: 0, minY: 0, minZ: 0, maxX: 20, maxY: 4, maxZ: 20 },
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 2 },
      grid: { width: 2, height: 1, chunkSize: 10, originX: -5, originY: 3 },
      storedChunkCount: 2,
      heightMap: { resolution: 2, valueBits: 16, valuesPerChunk: 4 },
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

function createAdapter(
  config: VegetationRuntimeConfig = vegetationRuntimeConfig,
): WebGLVegetationAdapter {
  return new WebGLVegetationAdapter(
    createRenderer(),
    createVegetationRuntimeDataset(createParsedFile(), config),
  );
}

describe('WebGLGrassView', () => {
  it('shares the ground texture and binds independent curves in every density bucket', () => {
    const adapter = createAdapter(groundColorConfig);
    const view = new WebGLGrassView(adapter, 0);
    const field = adapter.dataset.enabledLayers[0]!.groundPatchField!;
    const resource = adapter.staticResources.groundPatchFields[0]!;
    for (const { material } of view.densityDraws) {
      expect(material.defines.GROUND_COLOR_TRANSITION).toBe(1);
      expect(material.uniforms.groundPatchField!.value).toBe(resource.texture);
      expect(material.uniforms.groundBaseColor!.value).toEqual(new Color(field.baseColor));
      expect(material.uniforms.groundOrigin!.value.toArray()).toEqual([field.originX, field.originY]);
      expect(material.uniforms.groundExtent!.value.toArray()).toEqual([
        field.width * field.texelSizeUnits, field.height * field.texelSizeUnits,
      ]);
      expect(material.uniforms.bottomGroundTransition!.value.toArray()).toEqual([30, 120, 0]);
      expect(material.uniforms.topGroundTransition!.value.toArray()).toEqual([60, 180, 2]);
      expect(material.uniforms.distanceColorFarTint).toBeUndefined();
    }
    const disposed = vi.fn();
    resource.texture.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).not.toHaveBeenCalled();
    adapter.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('uses one fixed six-vertex blade quality in every density bucket', () => {
    const view = new WebGLGrassView(createAdapter(), 0);
    expect(view.densityDraws).toHaveLength(5);
    expect(view.densityDraws.map((draw) => ({
      capacity: draw.candidateCapacity,
      vertices: draw.geometry.getAttribute('position').count,
      triangles: draw.geometry.index!.count / 3,
    }))).toEqual([1, 2, 4, 8, 16].map((capacity) => ({
      capacity,
      vertices: 6,
      triangles: 4,
    })));
    expect(view.material.glslVersion).toBe(GLSL3);
    expect(view.material.lights).toBe(true);
    expect(view.material.toneMapped).toBe(true);
    expect(view.material.vertexShader).toBe(grassVertexShader);
    expect(view.material.fragmentShader).toBe(grassFragmentShader);
    expect(view.densityDraws.every((draw) => draw.mesh.receiveShadow)).toBe(true);
    expect(view.densityDraws.every((draw) => !draw.mesh.castShadow)).toBe(true);
  });

  it('binds compact active Cells and fixed layer resources', () => {
    const adapter = createAdapter();
    const view = new WebGLGrassView(adapter, 0);
    const bladeConfig = vegetationRuntimeConfig.layers[0]!.renderProfile.blade;
    expect(view.material.uniforms.activeCellIndices!.value).toBe(view.activeCellBuffer.texture);
    expect(view.material.uniforms.visibleTileRecords!.value).toBe(view.tileBuffer.texture);
    expect(view.material.uniforms.patternPositions!.value)
      .toBe(adapter.staticResources.patterns[0]!.texture);
    expect(view.material.uniforms.bladeHeight!.value.toArray()).toEqual([
      bladeConfig.heightMeters.minimum * 2,
      bladeConfig.heightMeters.maximum * 2,
    ]);
    expect(view.material.uniforms.useTwoSampleHeight!.value).toBe(false);
    expect(view.material.uniforms.directLightWeight!.value).toBe(0.35);
    expect(view.material.uniforms.cameraFacingDistance!.value.toArray()).toEqual([80, 140]);
    expect(view.candidatesPerVisibleChunk).toBe(16);
    expect(view.tileDensity.activeCellIndices).toHaveLength(6);
    expect(view.mesh.frustumCulled).toBe(false);
  });

  it('updates one shared Tile buffer and bounds padded GPU candidates below 2x', () => {
    const adapter = createAdapter();
    const view = new WebGLGrassView(adapter, 0);
    adapter.updateVisibleChunks(Uint32Array.from([1, 0]), 2);
    view.updateDensity({ x: 0, y: 2, z: 8 });

    expect(view.visibleTileCount).toBe(2);
    expect(view.visibleCandidateCount).toBeGreaterThan(0);
    expect(view.executedCandidateCount).toBeGreaterThanOrEqual(view.visibleCandidateCount);
    expect(view.executedCandidateCount).toBeLessThan(view.visibleCandidateCount * 2);
    expect(view.tileBuffer.visibleTileCount).toBe(2);
    expect(view.densityDraws.reduce(
      (sum, draw) => sum + draw.geometry.instanceCount,
      0,
    )).toBe(view.executedCandidateCount);
  });

  it('starts no GPU instances when the Cell curve is zero', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const zeroCurve = [
      { distanceMeters: 0, ratio: 0 },
      { distanceMeters: 500, ratio: 0 },
    ] as const;
    const view = new WebGLGrassView(createAdapter({
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, density: { ...layer.density, activeCells: zeroCurve } }],
    }), 0);
    view.updateDensity({ x: 0, y: 2, z: 8 });
    expect(view.visibleTileCount).toBe(0);
    expect(view.visibleCandidateCount).toBe(0);
    expect(view.executedCandidateCount).toBe(0);
  });

  it('removes mask rejection and legacy level growth from the vertex shader', () => {
    expect(grassVertexShader).toContain('activeCellIndices');
    expect(grassVertexShader).toContain('bucketCandidateCapacity');
    expect(grassVertexShader).toContain('candidateIndex >= activeElementCount');
    expect(grassVertexShader).not.toContain('layerMask');
    expect(grassVertexShader).not.toContain('isActiveCell');
    expect(grassVertexShader).not.toContain('bladeGrowth');
    expect(grassVertexShader).not.toContain('lodFadeRange');
    expect(grassVertexShader).not.toContain('verticalBladeHeight');
    expect(grassVertexShader).toContain('interpolateHeightSurface');
    expect(grassVertexShader).toContain('createGroundNormal(heightSurface.yz)');
    expect(grassVertexShader).toContain('flat out vec3 groundNormalView');
    const heightSurfaceShader = grassVertexShader.slice(
      grassVertexShader.indexOf('vec3 interpolateHeightSurface'),
      grassVertexShader.indexOf('vec3 createGroundNormal'),
    );
    expect(heightSurfaceShader.match(/readDecodedHeight\(/g)).toHaveLength(4);
    expect(grassVertexShader).toContain('bladeThicknessDistance');
    expect(grassVertexShader).toContain('cameraFacingProgress');
    expect(grassVertexShader).toContain('cameraFacingUp');
    expect(grassVertexShader).toContain('transpose(normalMatrix)');
    expect(grassVertexShader).toContain('vec3 transformedNormal = groundNormalView');
    expect(grassVertexShader).toContain('#include <shadowmap_vertex>');
    expect(grassVertexShader).toContain('vViewPosition');
    expect(grassFragmentShader).toContain('#include <lights_fragment_begin>');
    expect(grassFragmentShader).toContain('RE_Direct_Grass');
    expect(grassFragmentShader).toContain('* grassDirectLightWeight');
    expect(grassFragmentShader).toContain('dot(geometryNormal, directLight.direction)');
    expect(grassFragmentShader).toContain('groundColorProgress');
    expect(grassFragmentShader).toContain('mix(directLightWeight, 1.0, groundLightingProgress)');
    expect(grassFragmentShader).not.toContain('lights_lambert_pars_fragment');
    expect(grassFragmentShader).not.toContain('viewNormal');
    expect(grassFragmentShader).toContain('vViewPosition');
    expect(grassFragmentShader).toContain('#include <tonemapping_fragment>');
    expect(grassFragmentShader).toContain('#include <colorspace_fragment>');
  });

  it('disposes bucket resources and both shared textures once', () => {
    const view = new WebGLGrassView(createAdapter(), 0);
    const geometryDisposed = view.densityDraws.map(() => vi.fn());
    const materialDisposed = view.densityDraws.map(() => vi.fn());
    const tileBufferDisposed = vi.fn();
    const activeCellsDisposed = vi.fn();
    view.densityDraws.forEach((draw, index) => {
      draw.geometry.addEventListener('dispose', geometryDisposed[index]!);
      draw.material.addEventListener('dispose', materialDisposed[index]!);
    });
    view.tileBuffer.texture.addEventListener('dispose', tileBufferDisposed);
    view.activeCellBuffer.texture.addEventListener('dispose', activeCellsDisposed);

    view.dispose();

    geometryDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    materialDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    expect(tileBufferDisposed).toHaveBeenCalledOnce();
    expect(activeCellsDisposed).toHaveBeenCalledOnce();
  });
});
