import {
  Color,
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  RGFormat,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';
import { groundColorConfig } from './fixtures/groundColorConfig.js';
import {
  createVegetationRuntimeDataset,
  createThreeWebGLVegetationLightingMaterialFactory,
  grassLayerPreparation,
  grassFragmentShader,
  grassVertexShader,
  requireGrassRuntimeLayer,
  WebGLGrassLayerRenderer,
  WebGLSharedVegetationResources,
  type GrassRuntimeLayerConfig,
  type ParsedVegFile,
  type VegetationRuntimeConfig,
  type WebGLVegetationLightingMaterialFactory,
  type WebGLGrassGroundPatchSurface,
  type WebGLGrassLayerRendererOptions,
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

function createSharedResources(
  config: VegetationRuntimeConfig<GrassRuntimeLayerConfig> = vegetationRuntimeConfig,
): WebGLSharedVegetationResources {
  return new WebGLSharedVegetationResources(
    createRenderer(),
    createVegetationRuntimeDataset(createParsedFile(), config, [grassLayerPreparation]),
  );
}

function createGrassLayerRenderer(
  sharedResources: WebGLSharedVegetationResources,
  options: Omit<
    WebGLGrassLayerRendererOptions,
    'sharedResources' | 'layer'
  > = {},
): WebGLGrassLayerRenderer {
  return new WebGLGrassLayerRenderer({
    sharedResources,
    layer: requireGrassRuntimeLayer(sharedResources.dataset.preparedLayers[0]!),
    ...options,
  });
}

function createCloverConfig(): VegetationRuntimeConfig<GrassRuntimeLayerConfig> {
  const layer = groundColorConfig.layers[0]!;
  return {
    ...groundColorConfig,
    layers: [{
      ...layer,
      renderProfile: {
        ...layer.renderProfile,
        clover: {
          enabled: true,
          maximumRatio: 0.4,
          groundColorBias: 0.9,
          preferredGroundColor: '#4f8f3d',
          colorTolerance: 0.15,
          sizeMeters: { minimum: 0.1, maximum: 0.16 },
          heightOffsetMeters: 0.02,
          baseColor: '#397833',
          highlightColor: '#72ae5f',
        },
      },
    }],
  };
}

describe('WebGLGrassLayerRenderer', () => {
  it('shares the ground texture and binds independent top and bottom biases', () => {
    const sharedResources = createSharedResources(groundColorConfig);
    const view = createGrassLayerRenderer(sharedResources);
    const field = requireGrassRuntimeLayer(
      sharedResources.dataset.preparedLayers[0]!,
    ).preparedProfileData.groundPatchField!;
    const resource = view.layerResources.groundPatchField!;
    expect(resource.texture.image.data).toBe(field.data);
    expect(resource.texture.format).toBe(RGFormat);
    expect(resource.texture.magFilter).toBe(LinearFilter);
    expect(resource.texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(resource.texture.generateMipmaps).toBe(true);
    for (const { material } of view.candidateCapacityDraws) {
      expect(material.defines.GROUND_COLOR_FADE).toBe(1);
      expect(material.defines.GROUND_COLOR_SOURCE).toBe(1);
      expect(material.defines.LIGHT_DISTANCE_TRANSITION).toBe(1);
      expect(material.uniforms.groundPatchField!.value).toBe(resource.texture);
      expect(material.uniforms.groundColorBias!.value.toArray()).toEqual([0.35, 0.7]);
      expect(material.uniforms.groundBaseColor!.value).toEqual(new Color(field.baseColor));
      expect(material.uniforms.groundOrigin!.value.toArray()).toEqual([field.originX, field.originY]);
      expect(material.uniforms.groundExtent!.value.toArray()).toEqual([
        field.width * field.texelSizeUnits, field.height * field.texelSizeUnits,
      ]);
      expect(material.uniforms.bottomGroundTransition!.value.toArray()).toEqual([30, 120, 0]);
      expect(material.uniforms.topGroundTransition!.value.toArray()).toEqual([60, 180, 2]);
      expect(material.uniforms.lightWeights!.value.toArray()).toEqual([0.35, 1]);
      expect(material.uniforms.distanceLightWeights!.value.toArray()).toEqual([1, 1]);
      expect(material.uniforms.bottomLightTransition!.value.toArray()).toEqual([30, 120, 0]);
      expect(material.uniforms.topLightTransition!.value.toArray()).toEqual([60, 180, 2]);
      expect(material.uniforms.distanceColorFarTint).toBeUndefined();
    }
    const disposed = vi.fn();
    resource.texture.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    sharedResources.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('uses one fixed six-vertex blade quality in every density bucket', () => {
    const view = createGrassLayerRenderer(createSharedResources());
    expect(view.candidateCapacityDraws).toHaveLength(5);
    expect(view.candidateCapacityDraws.map((draw) => ({
      capacity: draw.candidateCapacity,
      vertices: draw.geometry.getAttribute('position').count,
      triangles: draw.geometry.index!.count / 3,
    }))).toEqual([1, 2, 4, 8, 16].map((capacity) => ({
      capacity,
      vertices: 6,
      triangles: 4,
    })));
    const firstCandidateCapacityMaterial = view.candidateCapacityDraws[0]!.material;
    expect(firstCandidateCapacityMaterial.glslVersion).toBe(GLSL3);
    expect(firstCandidateCapacityMaterial.lights).toBe(true);
    expect(firstCandidateCapacityMaterial.toneMapped).toBe(true);
    expect(firstCandidateCapacityMaterial.vertexShader).toContain('#include <shadowmap_vertex>');
    expect(firstCandidateCapacityMaterial.fragmentShader)
      .toContain('#include <lights_fragment_begin>');
    expect(firstCandidateCapacityMaterial.fragmentShader)
      .toContain('#include <tonemapping_fragment>');
    expect(firstCandidateCapacityMaterial.fragmentShader)
      .toContain('#include <colorspace_fragment>');
    expect(firstCandidateCapacityMaterial.fragmentShader)
      .not.toContain('#include <vegetation_');
    expect(view.candidateCapacityDraws.every((draw) => draw.mesh.receiveShadow)).toBe(true);
    expect(view.candidateCapacityDraws.every((draw) => !draw.mesh.castShadow)).toBe(true);
    expect(view.object3d.children).toEqual(
      view.candidateCapacityDraws.map((draw) => draw.mesh),
    );
  });

  it('selects textured triangular Clover per Anchor without adding draws or candidates', () => {
    const baseline = createGrassLayerRenderer(createSharedResources(groundColorConfig));
    const view = createGrassLayerRenderer(createSharedResources(createCloverConfig()));
    const firstCandidateCapacityDraw = view.candidateCapacityDraws[0]!;

    expect(view.candidateCapacityDraws)
      .toHaveLength(baseline.candidateCapacityDraws.length);
    expect(view.renderTileDensitySelection.maximumCandidatesPerTile)
      .toBe(baseline.renderTileDensitySelection.maximumCandidatesPerTile);
    expect(firstCandidateCapacityDraw.material.defines.CLOVER).toBe(1);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverMaximumRatio!.value).toBe(0.4);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverGroundColorBias!.value).toBe(0.9);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverPreferredGroundColor!.value)
      .toEqual(new Color('#4f8f3d'));
    expect(firstCandidateCapacityDraw.material.uniforms.cloverSize!.value.toArray())
      .toEqual([0.2, 0.32]);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverHeightOffset!.value).toBe(0.04);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverBaseColor!.value)
      .toEqual(new Color('#397833'));
    expect(firstCandidateCapacityDraw.material.uniforms.cloverHighlightColor!.value)
      .toEqual(new Color('#72ae5f'));
    const cloverTexture = view.layerResources.cloverTexture!.texture;
    const cloverData = cloverTexture.image.data as Uint8Array;
    expect(firstCandidateCapacityDraw.material.uniforms.cloverTexture!.value).toBe(cloverTexture);
    expect(cloverTexture.image.width).toBe(64);
    expect(cloverTexture.image.height).toBe(64);
    expect(cloverTexture.format).toBe(RGFormat);
    expect(cloverTexture.magFilter).toBe(LinearFilter);
    expect(cloverTexture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(cloverTexture.generateMipmaps).toBe(true);
    expect(cloverData.some((value, index) => index % 2 === 0 && value === 0)).toBe(true);
    expect(cloverData.some((value, index) => index % 2 === 0 && value > 0)).toBe(true);
    expect(cloverData.some((value, index) => index % 2 === 1 && value > 0)).toBe(true);
    expect(firstCandidateCapacityDraw.geometry.getAttribute('position').count).toBe(6);
    expect(firstCandidateCapacityDraw.geometry.index!.count / 3).toBe(4);
    expect(grassVertexShader).toContain('anchorSpeciesValue(anchorHashValue)');
    expect(grassVertexShader).toContain('anchorOrientationValue(anchorHashValue)');
    expect(grassVertexShader).toContain('anchorIsReflected(anchorHashValue)');
    expect(grassVertexShader).toContain('bool renderClover');
    expect(grassVertexShader).toContain('vec3 groundColor = sampleGroundColor(horizontalPosition)');
    expect(grassVertexShader)
      .toContain('vec3 anchorGroundColor = sampleGroundColor(anchorHorizontalPosition)');
    expect(grassVertexShader).toContain('distance(anchorGroundColor, cloverPreferredGroundColor)');
    expect(grassVertexShader).toContain('/ 65536.0');
    expect(grassVertexShader).toContain('/ 256.0 * 6.28318530718');
    expect(grassVertexShader).toContain('cloverMaximumRatio * mix');
    expect(grassVertexShader).toContain('vec2 effectiveGroundColorBias = groundColorBias');
    expect(grassVertexShader).toContain('effectiveGroundColorBias.x');
    expect(grassVertexShader).toContain('effectiveGroundColorBias.y');
    expect(grassVertexShader).toContain('effectiveGroundColorBias = mix');
    expect(grassVertexShader).toContain('float bottomGroundProgress');
    expect(grassVertexShader).toContain('float topGroundProgress');
    expect(grassVertexShader).toContain('renderCloverFragment = renderClover ? 1u : 0u');
    expect(grassVertexShader).toContain('position.y < 0.001');
    expect(grassFragmentShader).toContain('texture(cloverTexture, cloverUv).rg');
    expect(grassFragmentShader).toContain('if (cloverSample.r < 0.5) discard');

    baseline.dispose();
    const disposed = vi.fn();
    cloverTexture.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('binds compact active Cells and fixed layer resources', () => {
    const sharedResources = createSharedResources();
    const view = createGrassLayerRenderer(sharedResources);
    const firstCandidateCapacityDraw = view.candidateCapacityDraws[0]!;
    const bladeConfig = vegetationRuntimeConfig.layers[0]!.renderProfile.blade;
    expect(firstCandidateCapacityDraw.material.uniforms.activeCellIndices!.value)
      .toBe(view.activeCellIndexTexture.texture);
    expect(firstCandidateCapacityDraw.material.uniforms.visibleTileRecords!.value)
      .toBe(view.visibleRenderTileTexture.texture);
    expect(firstCandidateCapacityDraw.material.uniforms.patternPositions!.value)
      .toBe(view.layerResources.pattern.texture);
    expect(firstCandidateCapacityDraw.material.uniforms.bladeHeight!.value.toArray()).toEqual([
      bladeConfig.heightMeters.minimum * 2,
      bladeConfig.heightMeters.maximum * 2,
    ]);
    expect(firstCandidateCapacityDraw.material.uniforms.useTwoSampleHeight!.value).toBe(false);
    expect(firstCandidateCapacityDraw.material.uniforms.lightWeights!.value.toArray())
      .toEqual([0.35, 1]);
    expect(firstCandidateCapacityDraw.material.uniforms.groundNormalWeight).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.defines.LIGHTING_NORMAL_GEOMETRY).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.defines.LIGHTING_NORMAL_MIXED).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.uniforms.distanceLightWeights).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.uniforms.cameraFacingDistance!.value.toArray())
      .toEqual([80, 140]);
    expect(view.renderTileDensitySelection.maximumCandidatesPerTile).toBe(16);
    expect(view.renderTileDensitySelection.activeCellIndices).toHaveLength(6);
    expect(view.candidateCapacityDraws.every((draw) => !draw.mesh.frustumCulled)).toBe(true);
  });

  it('owns deterministic pattern anchors and Grass color palettes', () => {
    const view = createGrassLayerRenderer(createSharedResources());
    const colors = vegetationRuntimeConfig.layers[0]!.renderProfile.colors;

    expect(view.layerResources.pattern).toMatchObject({
      rotatePerCell: true,
      reflectPerCell: true,
    });
    expect(view.layerResources.pattern.patternSet.anchorsPerPattern).toBe(4);
    expect(view.layerResources.pattern.texture.image).toMatchObject({ width: 4, height: 4 });
    expect(view.layerResources.pattern.bottomColors)
      .toMatchObject({ colorCount: colors.bottomColors.length });
    expect(view.layerResources.pattern.bottomColors.texture.image)
      .toMatchObject({ width: colors.bottomColors.length, height: 1 });
    expect(view.layerResources.pattern.topColors)
      .toMatchObject({ colorCount: colors.topColors.length });
    expect(view.layerResources.pattern.topColors.texture.image)
      .toMatchObject({ width: colors.topColors.length, height: 1 });
  });

  it('uses a replacement lighting material factory for every density material', () => {
    const sharedResources = createSharedResources();
    const threeLightingMaterialFactory = createThreeWebGLVegetationLightingMaterialFactory();
    const createVegetationLightingMaterial = vi.fn((options) => (
      threeLightingMaterialFactory.createVegetationLightingMaterial(options)
    ));
    const lightingMaterialFactory: WebGLVegetationLightingMaterialFactory = {
      createVegetationLightingMaterial,
    };

    const view = createGrassLayerRenderer(sharedResources, {
      lightingMaterialFactory,
    });

    expect(createVegetationLightingMaterial)
      .toHaveBeenCalledTimes(view.candidateCapacityDraws.length);
    expect(createVegetationLightingMaterial.mock.calls[0]![0]).toMatchObject({
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
    });
  });

  it('lets the Grass renderer own optional ground-patch surface installation', () => {
    const remove = vi.fn();
    const install = vi.fn((context: Parameters<WebGLGrassGroundPatchSurface['install']>[0]) => {
      void context;
      return remove;
    });
    const surface: WebGLGrassGroundPatchSurface = { install };
    const view = createGrassLayerRenderer(createSharedResources(groundColorConfig), {
      lightingMaterialFactory: createThreeWebGLVegetationLightingMaterialFactory(),
      groundPatchSurface: surface,
    });

    expect(install).toHaveBeenCalledOnce();
    expect(install.mock.calls[0]![0]).toMatchObject({
      layer: { config: { renderProfile: { type: 'grass' } } },
      field: { layerId: 0 },
    });
    view.dispose();
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each([
    [{ source: 'ground' }, undefined, undefined],
    [{ source: 'geometry' }, 'LIGHTING_NORMAL_GEOMETRY', undefined],
    [{ source: 'mixed', groundWeight: 0.4 }, 'LIGHTING_NORMAL_MIXED', 0.4],
  ] as const)('maps the %o lighting normal to its shader path', (normal, define, weight) => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const view = createGrassLayerRenderer(createSharedResources({
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, lighting: { ...layer.lighting, normal } }],
    }));
    const firstCandidateCapacityMaterial = view.candidateCapacityDraws[0]!.material;

    if (define) expect(firstCandidateCapacityMaterial.defines[define]).toBe(1);
    if (weight === undefined) {
      expect(firstCandidateCapacityMaterial.uniforms.groundNormalWeight).toBeUndefined();
    } else {
      expect(firstCandidateCapacityMaterial.uniforms.groundNormalWeight!.value).toBe(weight);
    }
  });

  it('updates one visible Render Tile texture and bounds padded GPU candidates below 2x', () => {
    const sharedResources = createSharedResources();
    const view = createGrassLayerRenderer(sharedResources);
    sharedResources.visibleStoredChunkTexture.update(Uint32Array.from([1, 0]), 2);
    view.updateRenderTileSelection({ x: 0, y: 2, z: 8 });

    expect(view.visibleTileCount).toBe(2);
    expect(view.visibleCandidateCount).toBeGreaterThan(0);
    expect(view.executedCandidateCount).toBeGreaterThanOrEqual(view.visibleCandidateCount);
    expect(view.executedCandidateCount).toBeLessThan(view.visibleCandidateCount * 2);
    expect(view.visibleRenderTileTexture.visibleRenderTileCount).toBe(2);
    expect(view.candidateCapacityDraws.reduce(
      (sum, draw) => sum + draw.geometry.instanceCount,
      0,
    )).toBe(view.executedCandidateCount);
  });

  it('skips unchanged frame selection work', () => {
    const sharedResources = createSharedResources();
    const view = createGrassLayerRenderer(sharedResources);
    const updateRenderTileDensity = vi.spyOn(view.renderTileDensitySelection, 'update');
    const frameState = {
      cameraPositionModel: { x: 0, y: 2, z: 8 },
      clipFromModelMatrix: new Matrix4().elements,
      clipSpaceDepthRange: 'negative-one-to-one' as const,
    };
    sharedResources.visibleStoredChunkTexture.update(Uint32Array.from([0]), 1);

    view.updateFrame(frameState);
    view.updateFrame(frameState);
    sharedResources.visibleStoredChunkTexture.update(Uint32Array.from([0]), 1);
    view.updateFrame(frameState);

    expect(updateRenderTileDensity).toHaveBeenCalledOnce();

    sharedResources.visibleStoredChunkTexture.update(Uint32Array.from([]), 0);
    view.updateFrame(frameState);

    expect(updateRenderTileDensity).toHaveBeenCalledTimes(2);
  });

  it('starts no GPU instances when the Cell curve is zero', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const zeroCurve = [
      { distanceMeters: 0, ratio: 0 },
      { distanceMeters: 500, ratio: 0 },
    ] as const;
    const view = createGrassLayerRenderer(createSharedResources({
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, density: { ...layer.density, activeCells: zeroCurve } }],
    }));
    view.updateRenderTileSelection({ x: 0, y: 2, z: 8 });
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
    expect(grassVertexShader)
      .toContain('vec4 worldPosition = modelMatrix * vec4(basePosition, 1.0)');
    expect(grassVertexShader)
      .not.toContain('vec4 worldPosition = modelMatrix * vec4(modelPosition, 1.0)');
    expect(grassVertexShader).toContain('#include <vegetation_shadowmap_vertex>');
    expect(grassVertexShader).not.toContain('#include <shadowmap_vertex>');
    expect(grassVertexShader).toContain('vViewPosition');
    expect(grassFragmentShader).toContain('#include <vegetation_lighting_pars_fragment>');
    expect(grassFragmentShader).toContain('#include <vegetation_lighting_fragment>');
    expect(grassFragmentShader).not.toContain('#include <lights_fragment_begin>');
    expect(grassFragmentShader).not.toContain('RE_Direct_Vegetation');
    expect(grassFragmentShader).not.toContain('groundColorProgress');
    expect(grassFragmentShader).toContain('distanceLightWeights');
    expect(grassFragmentShader).toContain('groundNormalWeight');
    expect(grassFragmentShader).toContain('geometryNormalView');
    expect(grassFragmentShader).toContain('vViewPosition');
    expect(grassFragmentShader).toContain('#include <vegetation_tonemapping_fragment>');
    expect(grassFragmentShader).toContain('#include <vegetation_colorspace_fragment>');
  });

  it('disposes bucket, density, pattern, and palette resources once', () => {
    const view = createGrassLayerRenderer(createSharedResources());
    const geometryDisposed = view.candidateCapacityDraws.map(() => vi.fn());
    const materialDisposed = view.candidateCapacityDraws.map(() => vi.fn());
    const visibleRenderTileTextureDisposed = vi.fn();
    const activeCellsDisposed = vi.fn();
    const patternDisposed = vi.fn();
    const bottomColorsDisposed = vi.fn();
    const topColorsDisposed = vi.fn();
    view.candidateCapacityDraws.forEach((draw, index) => {
      draw.geometry.addEventListener('dispose', geometryDisposed[index]!);
      draw.material.addEventListener('dispose', materialDisposed[index]!);
    });
    view.visibleRenderTileTexture.texture.addEventListener(
      'dispose',
      visibleRenderTileTextureDisposed,
    );
    view.activeCellIndexTexture.texture.addEventListener('dispose', activeCellsDisposed);
    view.layerResources.pattern.texture.addEventListener('dispose', patternDisposed);
    view.layerResources.pattern.bottomColors.texture
      .addEventListener('dispose', bottomColorsDisposed);
    view.layerResources.pattern.topColors.texture
      .addEventListener('dispose', topColorsDisposed);

    view.dispose();

    geometryDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    materialDisposed.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
    expect(visibleRenderTileTextureDisposed).toHaveBeenCalledOnce();
    expect(activeCellsDisposed).toHaveBeenCalledOnce();
    expect(patternDisposed).toHaveBeenCalledOnce();
    expect(bottomColorsDisposed).toHaveBeenCalledOnce();
    expect(topColorsDisposed).toHaveBeenCalledOnce();
  });
});
