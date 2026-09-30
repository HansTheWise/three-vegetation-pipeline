import {
  Color,
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
  createPreparedVegetationDataset,
  createThreeWebGLGrassLightingMaterialFactory,
  grassLayerPreparation,
  grassFragmentShader,
  grassVertexShader,
  requireGrassRuntimeLayer,
  WebGLGrassLayerRenderer,
  WebGLVegetationDatasetTextures,
  WebGLVisibleStoredChunkTexture,
  type GrassRuntimeLayerConfig,
  type ParsedVegFile,
  type VegetationRuntimeConfig,
  type WebGLGrassLightingMaterialFactory,
  type WebGLGrassGroundPatchSurface,
  type WebGLGrassLayerRendererOptions,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

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
      vegetationSeed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: { minX: 0, minY: 0, minZ: 0, maxX: 20, maxY: 4, maxZ: 20 },
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 2 },
      grid: { width: 2, height: 1, chunkSize: 10, originX: -5, originY: 3 },
      storedChunkCount: 2,
      heightMap: { resolutionPerChunkAxis: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.from([0, 1]),
    chunkHeightRanges: Float32Array.from([1, 2, 3, 4]),
    heightData: Uint16Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
    layers: [{
      vegetationLayerId: 0,
      maskResolutionPerChunkAxis: 2,
      maskWordsPerChunk: 1,
      maskData: Uint32Array.from([0b1111, 0b0011]),
    }],
  };
}

function createGrassRendererDependencies(
  config: VegetationRuntimeConfig<GrassRuntimeLayerConfig> = vegetationRuntimeConfig,
): GrassRendererDependencies {
  const renderer = createRenderer();
  const vegetationDataset = createPreparedVegetationDataset(
    createParsedFile(),
    config,
    [grassLayerPreparation],
  );
  const vegetationDatasetTextures = new WebGLVegetationDatasetTextures(
    renderer,
    vegetationDataset,
  );
  const visibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(
    renderer,
    vegetationDataset.file.header.storedChunkCount,
  );
  return {
    renderer,
    vegetationDataset,
    vegetationDatasetTextures,
    visibleStoredChunkTexture,
    dispose(): void {
      visibleStoredChunkTexture.dispose();
      vegetationDatasetTextures.dispose();
    },
  };
}

function createGrassLayerRenderer(
  rendererDependencies: GrassRendererDependencies,
  options: Omit<
    WebGLGrassLayerRendererOptions,
    | 'renderer'
    | 'vegetationDataset'
    | 'vegetationDatasetTextures'
    | 'visibleStoredChunkTexture'
    | 'layer'
  > = {},
): WebGLGrassLayerRenderer {
  return new WebGLGrassLayerRenderer({
    renderer: rendererDependencies.renderer,
    vegetationDataset: rendererDependencies.vegetationDataset,
    vegetationDatasetTextures: rendererDependencies.vegetationDatasetTextures,
    visibleStoredChunkTexture: rendererDependencies.visibleStoredChunkTexture,
    layer: requireGrassRuntimeLayer(
      rendererDependencies.vegetationDataset.preparedLayers[0]!,
    ),
    ...options,
  });
}

type GrassRendererDependencies = Pick<
  WebGLGrassLayerRendererOptions,
  | 'renderer'
  | 'vegetationDataset'
  | 'vegetationDatasetTextures'
  | 'visibleStoredChunkTexture'
> & Readonly<{ dispose(): void }>;

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
    const rendererDependencies = createGrassRendererDependencies(groundColorConfig);
    const view = createGrassLayerRenderer(rendererDependencies);
    const layer = requireGrassRuntimeLayer(
      rendererDependencies.vegetationDataset.preparedLayers[0]!,
    );
    const field = layer.preparedProfileData.groundPatchField!;
    const groundColorAdaptation = layer.config.renderProfile.colors
      .groundColorAdaptation!;
    const groundColorTransition = layer.config.renderProfile.colors
      .distanceColorTransition;
    const lightTransition = layer.config.lighting.distanceTransition!;
    if (!('target' in groundColorTransition)) {
      throw new Error('Test config must use a ground-color distance transition.');
    }
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
      expect(material.uniforms.groundColorBias!.value.toArray()).toEqual([
        groundColorAdaptation.bottomBias,
        groundColorAdaptation.topBias,
      ]);
      expect(material.uniforms.groundBaseColor!.value).toEqual(new Color(field.baseColor));
      expect(material.uniforms.groundOrigin!.value.toArray()).toEqual([field.originX, field.originY]);
      expect(material.uniforms.groundExtent!.value.toArray()).toEqual([
        field.width * field.texelSizeUnits, field.height * field.texelSizeUnits,
      ]);
      expect(material.uniforms.bottomGroundTransition!.value.toArray()).toEqual([
        groundColorTransition.bottom.startsAtMeters,
        groundColorTransition.bottom.endsAtMeters,
        groundColorTransition.bottom.curveStrength,
      ]);
      expect(material.uniforms.topGroundTransition!.value.toArray()).toEqual([
        groundColorTransition.top.startsAtMeters,
        groundColorTransition.top.endsAtMeters,
        groundColorTransition.top.curveStrength,
      ]);
      expect(material.uniforms.lightWeights!.value.toArray()).toEqual([
        layer.config.lighting.directLightWeight,
        layer.config.lighting.indirectLightWeight,
      ]);
      expect(material.uniforms.distanceLightWeights!.value.toArray()).toEqual([
        lightTransition.directLightWeight,
        lightTransition.indirectLightWeight,
      ]);
      expect(material.uniforms.bottomLightTransition!.value.toArray()).toEqual([
        lightTransition.bottom.startsAtMeters,
        lightTransition.bottom.endsAtMeters,
        lightTransition.bottom.curveStrength,
      ]);
      expect(material.uniforms.topLightTransition!.value.toArray()).toEqual([
        lightTransition.top.startsAtMeters,
        lightTransition.top.endsAtMeters,
        lightTransition.top.curveStrength,
      ]);
      expect(material.uniforms.distanceColorFarTint).toBeUndefined();
    }
    const disposed = vi.fn();
    resource.texture.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    rendererDependencies.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('binds configured Clover rendering without adding draws or candidates', () => {
    const baseline = createGrassLayerRenderer(
      createGrassRendererDependencies(groundColorConfig),
    );
    const cloverConfig = createCloverConfig();
    const cloverLayerConfig = cloverConfig.layers[0]!.renderProfile.clover;
    if (!cloverLayerConfig || !cloverLayerConfig.enabled) {
      throw new Error('Test config must enable Clover rendering.');
    }
    const rendererDependencies = createGrassRendererDependencies(cloverConfig);
    const view = createGrassLayerRenderer(
      rendererDependencies,
    );
    const firstCandidateCapacityDraw = view.candidateCapacityDraws[0]!;
    const unitsPerMeter = rendererDependencies.vegetationDataset.file.header
      .coordinateSystem.unitsPerMeter;

    expect(view.candidateCapacityDraws)
      .toHaveLength(baseline.candidateCapacityDraws.length);
    expect(view.renderTileDensitySelection.maximumCandidatesPerTile)
      .toBe(baseline.renderTileDensitySelection.maximumCandidatesPerTile);
    expect(firstCandidateCapacityDraw.material.defines.CLOVER).toBe(1);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverMaximumRatio!.value)
      .toBe(cloverLayerConfig.maximumRatio);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverGroundColorBias!.value)
      .toBe(cloverLayerConfig.groundColorBias);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverPreferredGroundColor!.value)
      .toEqual(new Color(cloverLayerConfig.preferredGroundColor));
    expect(firstCandidateCapacityDraw.material.uniforms.cloverSize!.value.toArray())
      .toEqual([
        cloverLayerConfig.sizeMeters.minimum * unitsPerMeter,
        cloverLayerConfig.sizeMeters.maximum * unitsPerMeter,
      ]);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverHeightOffset!.value)
      .toBe(cloverLayerConfig.heightOffsetMeters * unitsPerMeter);
    expect(firstCandidateCapacityDraw.material.uniforms.cloverBaseColor!.value)
      .toEqual(new Color(cloverLayerConfig.baseColor));
    expect(firstCandidateCapacityDraw.material.uniforms.cloverHighlightColor!.value)
      .toEqual(new Color(cloverLayerConfig.highlightColor));
    const cloverTexture = view.layerResources.cloverTexture!.texture;
    const cloverData = cloverTexture.image.data as Uint8Array;
    expect(firstCandidateCapacityDraw.material.uniforms.cloverTexture!.value).toBe(cloverTexture);
    expect(cloverTexture.format).toBe(RGFormat);
    expect(cloverTexture.magFilter).toBe(LinearFilter);
    expect(cloverTexture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(cloverTexture.generateMipmaps).toBe(true);
    expect(cloverData.some((value, index) => index % 2 === 0 && value === 0)).toBe(true);
    expect(cloverData.some((value, index) => index % 2 === 0 && value > 0)).toBe(true);
    expect(cloverData.some((value, index) => index % 2 === 1 && value > 0)).toBe(true);
    baseline.dispose();
    const disposed = vi.fn();
    cloverTexture.addEventListener('dispose', disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('binds compact active Cells and fixed layer resources', () => {
    const rendererDependencies = createGrassRendererDependencies();
    const view = createGrassLayerRenderer(rendererDependencies);
    const firstCandidateCapacityDraw = view.candidateCapacityDraws[0]!;
    const layer = requireGrassRuntimeLayer(
      rendererDependencies.vegetationDataset.preparedLayers[0]!,
    );
    const bladeConfig = layer.config.renderProfile.blade;
    const unitsPerMeter = rendererDependencies.vegetationDataset.file.header
      .coordinateSystem.unitsPerMeter;
    const tileSizeCells = Math.min(
      layer.config.density.renderTileSizeCells,
      layer.fileLayer.maskResolutionPerChunkAxis,
    );
    expect(firstCandidateCapacityDraw.material.uniforms.activeCellIndices!.value)
      .toBe(view.activeCellIndexTexture.texture);
    expect(firstCandidateCapacityDraw.material.uniforms.visibleTileRecords!.value)
      .toBe(view.visibleRenderTileTexture.texture);
    expect(firstCandidateCapacityDraw.material.uniforms.patternPositions!.value)
      .toBe(view.layerResources.pattern.texture);
    expect(firstCandidateCapacityDraw.material.uniforms.bladeHeight!.value.toArray()).toEqual([
      bladeConfig.heightMeters.minimum * unitsPerMeter,
      bladeConfig.heightMeters.maximum * unitsPerMeter,
    ]);
    expect(firstCandidateCapacityDraw.material.uniforms.useTwoSampleHeight!.value).toBe(false);
    expect(firstCandidateCapacityDraw.material.uniforms.lightWeights!.value.toArray())
      .toEqual([
        layer.config.lighting.directLightWeight,
        layer.config.lighting.indirectLightWeight,
      ]);
    expect(firstCandidateCapacityDraw.material.uniforms.groundNormalWeight).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.defines.LIGHTING_NORMAL_GEOMETRY).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.defines.LIGHTING_NORMAL_MIXED).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.uniforms.distanceLightWeights).toBeUndefined();
    expect(firstCandidateCapacityDraw.material.uniforms.cameraFacingDistance!.value.toArray())
      .toEqual([
        bladeConfig.cameraFacing.startsAtMeters,
        bladeConfig.cameraFacing.reachesFullAtMeters,
      ]);
    expect(view.renderTileDensitySelection.maximumCandidatesPerTile).toBe(
      tileSizeCells ** 2
      * layer.config.distribution.anchorsPerCell
      * layer.config.distribution.elementsPerAnchor,
    );
    expect(view.renderTileDensitySelection.activeCellIndices)
      .toBe(layer.preparedProfileData.activeCells.indices);
    expect(view.candidateCapacityDraws.every((draw) => !draw.mesh.frustumCulled)).toBe(true);
  });

  it('owns deterministic pattern anchors and Grass color palettes', () => {
    const rendererDependencies = createGrassRendererDependencies();
    const view = createGrassLayerRenderer(rendererDependencies);
    const layer = requireGrassRuntimeLayer(
      rendererDependencies.vegetationDataset.preparedLayers[0]!,
    );
    const colors = layer.config.renderProfile.colors;

    expect(view.layerResources.pattern).toMatchObject({
      rotatePerCell: layer.config.pattern.rotatePerCell,
      reflectPerCell: layer.config.pattern.reflectPerCell,
    });
    expect(view.layerResources.pattern.patternSet.anchorsPerPattern)
      .toBe(layer.config.distribution.anchorsPerCell);
    expect(view.layerResources.pattern.texture.image).toMatchObject({
      width: layer.config.distribution.anchorsPerCell,
      height: layer.config.pattern.patternCount,
    });
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
    const rendererDependencies = createGrassRendererDependencies();
    const threeGrassLightingMaterialFactory = createThreeWebGLGrassLightingMaterialFactory();
    const createGrassLightingMaterial = vi.fn((options) => (
      threeGrassLightingMaterialFactory.createGrassLightingMaterial(options)
    ));
    const grassLightingMaterialFactory: WebGLGrassLightingMaterialFactory = {
      createGrassLightingMaterial,
    };

    const view = createGrassLayerRenderer(rendererDependencies, {
      grassLightingMaterialFactory,
    });

    expect(createGrassLightingMaterial)
      .toHaveBeenCalledTimes(view.candidateCapacityDraws.length);
    expect(createGrassLightingMaterial.mock.calls[0]![0]).toMatchObject({
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
    const view = createGrassLayerRenderer(createGrassRendererDependencies(groundColorConfig), {
      grassLightingMaterialFactory: createThreeWebGLGrassLightingMaterialFactory(),
      groundPatchSurface: surface,
    });

    expect(install).toHaveBeenCalledOnce();
    expect(install.mock.calls[0]![0]).toMatchObject({
      layer: { config: { renderProfile: { type: 'grass' } } },
      field: { vegetationLayerId: 0 },
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
    const view = createGrassLayerRenderer(createGrassRendererDependencies({
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
    const rendererDependencies = createGrassRendererDependencies();
    const view = createGrassLayerRenderer(rendererDependencies);
    rendererDependencies.visibleStoredChunkTexture.update(Uint32Array.from([1, 0]), 2);
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
    const rendererDependencies = createGrassRendererDependencies();
    const view = createGrassLayerRenderer(rendererDependencies);
    const updateRenderTileDensity = vi.spyOn(view.renderTileDensitySelection, 'update');
    const frameState = {
      cameraPositionModel: { x: 0, y: 2, z: 8 },
      clipFromModelMatrix: new Matrix4().elements,
      clipSpaceDepthRange: 'negative-one-to-one' as const,
    };
    rendererDependencies.visibleStoredChunkTexture.update(Uint32Array.from([0]), 1);

    view.updateFrame(frameState);
    view.updateFrame(frameState);
    rendererDependencies.visibleStoredChunkTexture.update(Uint32Array.from([0]), 1);
    view.updateFrame(frameState);

    expect(updateRenderTileDensity).toHaveBeenCalledOnce();

    rendererDependencies.visibleStoredChunkTexture.update(Uint32Array.from([]), 0);
    view.updateFrame(frameState);

    expect(updateRenderTileDensity).toHaveBeenCalledTimes(2);
  });

  it('starts no GPU instances when the Cell curve is zero', () => {
    const layer = vegetationRuntimeConfig.layers[0]!;
    const maximumDistanceMeters = layer.visibility.maximumDistanceMeters;
    const zeroCurve = [
      { distanceMeters: 0, ratio: 0 },
      { distanceMeters: maximumDistanceMeters, ratio: 0 },
    ] as const;
    const view = createGrassLayerRenderer(createGrassRendererDependencies({
      ...vegetationRuntimeConfig,
      layers: [{ ...layer, density: { ...layer.density, activeCells: zeroCurve } }],
    }));
    view.updateRenderTileSelection({ x: 0, y: 2, z: 8 });
    expect(view.visibleTileCount).toBe(0);
    expect(view.visibleCandidateCount).toBe(0);
    expect(view.executedCandidateCount).toBe(0);
  });

  it('disposes bucket, density, pattern, and palette resources once', () => {
    const view = createGrassLayerRenderer(createGrassRendererDependencies());
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
