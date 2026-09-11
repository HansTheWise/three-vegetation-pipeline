import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

import type { Axis } from '../../../offline/config/types.js';
import { createThreeSceneLightingAdapter } from '../../adapters/three/ThreeSceneLightingAdapter.js';
import type { ClipSpaceDepthRange, Matrix4Elements } from '../../chunking/types.js';
import { VegetationRenderTileDensity } from '../../density/VegetationRenderTileDensity.js';
import type { ModelPosition, VegetationActiveCellData } from '../../density/types.js';
import type { VegetationFrameState } from '../../frame/types.js';
import { WebGLActiveCellBuffer } from '../../gpu/webgl/WebGLActiveCellBuffer.js';
import { validateWebGLInstanceCount } from '../../gpu/webgl/limits.js';
import { WebGLVisibleTileBuffer } from '../../gpu/webgl/WebGLVisibleTileBuffer.js';
import type { WebGLVegetationAdapter } from '../../gpu/webgl/WebGLVegetationAdapter.js';
import {
  requireGrassRuntimeLayer,
} from '../../profiles/grass/GrassLayerPreparation.js';
import type { WebGLGrassGroundPatchSurface } from '../../profiles/grass/rendering/webgl/WebGLGrassGroundPatchSurface.js';
import { WebGLGrassLayerResources } from './WebGLGrassLayerResources.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererDiagnostics,
} from './WebGLVegetationLayerRenderer.js';
import type { WebGLVegetationLightingAdapter } from './WebGLVegetationLightingAdapter.js';
import { grassFragmentShader } from './shaders/grassFragmentShader.js';
import { grassVertexShader } from './shaders/grassVertexShader.js';

export type WebGLGrassDensityDraw = Readonly<{
  bucketIndex: number;
  candidateCapacity: number;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
}>;

/** Draws exact continuous tile densities through bounded GPU capacity buckets. */
export class WebGLGrassView implements WebGLVegetationLayerRenderer {
  readonly geometry: InstancedBufferGeometry;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly object3d: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly densityDraws: readonly WebGLGrassDensityDraw[];
  readonly resources: WebGLGrassLayerResources;
  readonly layerId: number;
  readonly candidatesPerVisibleChunk: number;
  readonly tileDensity: VegetationRenderTileDensity;
  readonly tileBuffer: WebGLVisibleTileBuffer;
  readonly activeCellBuffer: WebGLActiveCellBuffer;

  readonly #adapter: WebGLVegetationAdapter;
  readonly #cameraPositionModel = new Vector3();
  readonly #removeGroundPatchSurface: () => void;

  constructor(
    adapter: WebGLVegetationAdapter,
    layerId: number,
    preparedCells?: VegetationActiveCellData,
    lighting: WebGLVegetationLightingAdapter = createThreeSceneLightingAdapter(),
    groundPatchSurface?: WebGLGrassGroundPatchSurface,
  ) {
    const layer = adapter.dataset.enabledLayers.find(
      (candidate) => candidate.layerId === layerId,
    );
    if (!layer) {
      throw new Error(`Enabled runtime grass layer ${layerId} does not exist.`);
    }
    const layerMask = adapter.staticResources.layerMasks.find(
      (candidate) => candidate.layerId === layerId,
    );
    if (!layerMask) {
      throw new Error(`Runtime grass layer ${layerId} has incomplete WebGL resources.`);
    }
    const grassLayer = requireGrassRuntimeLayer(layer);
    const profile = grassLayer.config.renderProfile;
    const grassData = grassLayer.profileData;
    this.#adapter = adapter;
    this.layerId = layerId;
    this.tileDensity = new VegetationRenderTileDensity(
      adapter.dataset,
      layerId,
      preparedCells ?? grassData.activeCells,
    );
    this.candidatesPerVisibleChunk = layerMask.maskResolution ** 2
      * grassData.patterns.anchorsPerPattern
      * grassLayer.config.distribution.elementsPerAnchor;
    const maximumInstanceCount = this.tileDensity.tileCapacity
      * this.tileDensity.maximumCandidatesPerTile;
    validateWebGLInstanceCount(maximumInstanceCount, `Grass layer ${layerId}`);

    const resources = new WebGLGrassLayerResources(adapter.renderer, layer);
    let tileBuffer: WebGLVisibleTileBuffer | undefined;
    let activeCellBuffer: WebGLActiveCellBuffer | undefined;
    let removeGroundPatchSurface: () => void = () => undefined;
    const densityDraws: WebGLGrassDensityDraw[] = [];
    try {
      tileBuffer = new WebGLVisibleTileBuffer(
        adapter.renderer,
        this.tileDensity.tileCapacity,
        `vegetation/layer-${layerId}-density-tiles`,
      );
      activeCellBuffer = new WebGLActiveCellBuffer(
        adapter.renderer,
        this.tileDensity.activeCellIndices,
        `vegetation/layer-${layerId}-active-cells`,
      );
      const createdResources = resources;
      const createdTileBuffer = tileBuffer;
      const createdActiveCellBuffer = activeCellBuffer;
      this.tileDensity.bucketCapacities.forEach((candidateCapacity, bucketIndex) => {
        const geometry = createGrassBladeGeometry(profile.blade.segments);
        let material: ShaderMaterial;
        try {
          material = createGrassMaterial({
            adapter,
            layerId,
            candidateCapacity,
            tileBuffer: createdTileBuffer,
            activeCellBuffer: createdActiveCellBuffer,
            cameraPositionModel: this.#cameraPositionModel,
            resources: createdResources,
            lighting,
          });
        } catch (error) {
          geometry.dispose();
          throw error;
        }
        const mesh = new Mesh(geometry, material);
        mesh.name = `vegetation/grass-layer-${layerId}-density-${candidateCapacity}`;
        mesh.frustumCulled = false;
        mesh.castShadow = grassLayer.config.shadows.cast;
        mesh.receiveShadow = grassLayer.config.shadows.receive;
        densityDraws.push({ bucketIndex, candidateCapacity, geometry, material, mesh });
      });
      const patchField = grassLayer.profileData.groundPatchField;
      const patchTexture = resources.groundPatchField?.texture;
      if (groundPatchSurface && patchField && patchTexture) {
        removeGroundPatchSurface = groundPatchSurface.install({
          dataset: adapter.dataset,
          layer: grassLayer,
          field: patchField,
          texture: patchTexture,
        });
      }
    } catch (error) {
      removeGroundPatchSurface();
      for (let index = densityDraws.length - 1; index >= 0; index -= 1) {
        densityDraws[index]!.geometry.dispose();
        densityDraws[index]!.material.dispose();
      }
      activeCellBuffer?.dispose();
      tileBuffer?.dispose();
      resources.dispose();
      throw error;
    }
    this.resources = resources;
    this.tileBuffer = tileBuffer;
    this.activeCellBuffer = activeCellBuffer;
    this.#removeGroundPatchSurface = removeGroundPatchSurface;
    this.densityDraws = densityDraws;
    this.geometry = this.densityDraws[0]!.geometry;
    this.material = this.densityDraws[0]!.material;
    this.mesh = this.densityDraws[0]!.mesh;
    this.object3d = this.mesh;
    for (let bucketIndex = 1; bucketIndex < this.densityDraws.length; bucketIndex += 1) {
      this.mesh.add(this.densityDraws[bucketIndex]!.mesh);
    }
  }

  get visibleTileCount(): number {
    return this.tileDensity.visibleTileCount;
  }

  /** Exact visible blade count before capacity-bucket padding. */
  get visibleCandidateCount(): number {
    return this.tileDensity.visibleCandidateCount;
  }

  /** Submitted blade instances including capacity-bucket padding, not vertex invocations. */
  get executedCandidateCount(): number {
    return this.densityDraws.reduce((sum, draw) => sum + draw.geometry.instanceCount, 0);
  }

  get frustumTestedTileCount(): number {
    return this.tileDensity.frustumTestedTileCount;
  }

  get frustumCulledTileCount(): number {
    return this.tileDensity.frustumCulledTileCount;
  }

  get diagnostics(): WebGLVegetationLayerRendererDiagnostics {
    return this;
  }

  updateFrame(frameState: VegetationFrameState): void {
    this.updateDensity(
      frameState.cameraPositionModel,
      frameState.clipFromModelMatrix,
      frameState.clipSpaceDepthRange,
    );
  }

  /** Updates continuous tile density from the model-local culling camera. */
  updateDensity(
    cameraPositionModel: ModelPosition,
    clipFromModelMatrix?: Matrix4Elements,
    depthRange: ClipSpaceDepthRange = 'negative-one-to-one',
  ): void {
    this.#cameraPositionModel.set(
      cameraPositionModel.x,
      cameraPositionModel.y,
      cameraPositionModel.z,
    );
    const visibleChunks = this.#adapter.visibleChunkBuffer;
    this.tileDensity.update(
      visibleChunks.data,
      visibleChunks.visibleChunkCount,
      cameraPositionModel,
      clipFromModelMatrix,
      depthRange,
    );
    this.tileBuffer.update(this.tileDensity.tileRecords, this.tileDensity.visibleTileCount);
    this.densityDraws.forEach((draw, bucketIndex) => {
      const tileCount = this.tileDensity.bucketTileCounts[bucketIndex]!;
      draw.material.uniforms.tileRecordOffset!.value =
        this.tileDensity.bucketRecordOffsets[bucketIndex]!;
      draw.geometry.instanceCount = tileCount * draw.candidateCapacity;
    });
  }

  dispose(): void {
    this.#removeGroundPatchSurface();
    for (const draw of this.densityDraws) {
      draw.geometry.dispose();
      draw.material.dispose();
    }
    this.tileBuffer.dispose();
    this.activeCellBuffer.dispose();
    this.resources.dispose();
  }
}

type GrassMaterialOptions = Readonly<{
  adapter: WebGLVegetationAdapter;
  layerId: number;
  candidateCapacity: number;
  tileBuffer: WebGLVisibleTileBuffer;
  activeCellBuffer: WebGLActiveCellBuffer;
  cameraPositionModel: Vector3;
  resources: WebGLGrassLayerResources;
  lighting: WebGLVegetationLightingAdapter;
}>;

function createGrassMaterial(options: GrassMaterialOptions): ShaderMaterial {
  const { adapter, layerId } = options;
  const layer = adapter.dataset.enabledLayers.find((candidate) => candidate.layerId === layerId)!;
  const patternResource = options.resources.pattern;
  const { header } = adapter.staticResources;
  const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
  const unitsPerMeter = header.coordinateSystem.unitsPerMeter;
  const grassRuntimeLayer = requireGrassRuntimeLayer(layer);
  const grassLayer = grassRuntimeLayer.config;
  const profile = grassLayer.renderProfile;
  const distanceColor = profile.colors.distanceColorTransition;
  const groundTransition = 'target' in distanceColor ? distanceColor : undefined;
  const groundField = grassRuntimeLayer.profileData.groundPatchField;
  const groundTexture = options.resources.groundPatchField?.texture;
  if (groundTransition && (!groundField || !groundTexture)) {
    throw new Error(`Grass layer ${layerId} needs a ground patch field for its color transition.`);
  }
  const thickness = profile.bladeThicknessDistanceScaling;
  const lightTransition = grassLayer.lighting.distanceTransition;
  const lightingNormal = grassLayer.lighting.normal;
  return options.lighting.createMaterial({
    name: `vegetation/grass-layer-${layerId}-density-${options.candidateCapacity}`,
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    side: DoubleSide,
    defines: {
      ...(groundTransition ? { GROUND_COLOR_TRANSITION: 1 } : {}),
      ...(lightTransition ? { LIGHT_DISTANCE_TRANSITION: 1 } : {}),
      ...(lightingNormal.source === 'geometry' ? { LIGHTING_NORMAL_GEOMETRY: 1 } : {}),
      ...(lightingNormal.source === 'mixed' ? { LIGHTING_NORMAL_MIXED: 1 } : {}),
    },
    uniforms: {
      visibleTileRecords: { value: options.tileBuffer.texture },
      visibleTileTextureWidth: { value: options.tileBuffer.textureWidth },
      activeCellIndices: { value: options.activeCellBuffer.texture },
      activeCellTextureWidth: { value: options.activeCellBuffer.textureWidth },
      tileRecordOffset: { value: 0 },
      bucketCandidateCapacity: { value: options.candidateCapacity },
      storedChunkGridCoordinates: {
        value: adapter.staticResources.storedChunkGridCoordinatesTexture,
      },
      chunkHeightRanges: { value: adapter.staticResources.chunkHeightRangesTexture },
      heightData: { value: adapter.staticResources.heightDataTexture },
      patternPositions: { value: patternResource.texture },
      bottomColors: { value: patternResource.bottomColors.texture },
      topColors: { value: patternResource.topColors.texture },
      seed: { value: header.seed },
      layerId: { value: layerId },
      patternCount: { value: patternResource.patternSet.patternCount },
      maskResolution: { value: layer.fileLayer.maskResolution },
      bottomColorCount: { value: patternResource.bottomColors.colorCount },
      topColorCount: { value: patternResource.topColors.colorCount },
      rotatePerCell: { value: patternResource.rotatePerCell },
      reflectPerCell: { value: patternResource.reflectPerCell },
      gridOrigin: { value: new Vector2(header.grid.originX, header.grid.originY) },
      chunkSize: { value: header.grid.chunkSize },
      heightResolution: { value: header.heightMap.resolution },
      maximumQuantizedHeight: { value: (2 ** header.heightMap.valueBits) - 1 },
      unitsPerMeter: { value: unitsPerMeter },
      cameraPositionModel: { value: options.cameraPositionModel },
      horizontalAxisA: { value: createAxisVector(horizontalAxisA) },
      horizontalAxisB: { value: createAxisVector(horizontalAxisB) },
      upAxis: { value: createAxisVector(header.coordinateSystem.upAxis) },
      bladeHeight: {
        value: new Vector2(
          profile.blade.heightMeters.minimum * unitsPerMeter,
          profile.blade.heightMeters.maximum * unitsPerMeter,
        ),
      },
      bladeWidth: {
        value: new Vector2(
          profile.blade.widthMeters.minimum * unitsPerMeter,
          profile.blade.widthMeters.maximum * unitsPerMeter,
        ),
      },
      bladeTopWidthRatio: { value: profile.blade.topWidthRatio },
      maximumBladeTiltRadians: {
        value: degreesToRadians(profile.blade.maximumTiltDegrees),
      },
      cameraFacingDistance: {
        value: new Vector2(
          profile.blade.cameraFacing.startsAtMeters,
          profile.blade.cameraFacing.reachesFullAtMeters,
        ),
      },
      maximumBladeOffset: {
        value: grassLayer.distribution.elementRadiusMeters * unitsPerMeter,
      },
      useTwoSampleHeight: {
        value: profile.blade.heightSampling === 'diagonal-average',
      },
      bladeThicknessDistance: {
        value: new Vector2(thickness.startsIncreasingAtMeters, thickness.reachesMaximumAtMeters),
      },
      bladeThicknessScale: { value: new Vector2(thickness.defaultScale, thickness.maximumScale) },
      bladeThicknessCurveStrength: { value: thickness.curveStrength },
      lightWeights: { value: new Vector2(
        grassLayer.lighting.directLightWeight,
        grassLayer.lighting.indirectLightWeight,
      ) },
      ...(lightingNormal.source === 'mixed'
        ? { groundNormalWeight: { value: lightingNormal.groundWeight } }
        : {}),
      ...(lightTransition ? {
        distanceLightWeights: { value: new Vector2(
          lightTransition.directLightWeight,
          lightTransition.indirectLightWeight,
        ) },
        bottomLightTransition: { value: new Vector3(
          lightTransition.bottom.startsAtMeters,
          lightTransition.bottom.endsAtMeters,
          lightTransition.bottom.curveStrength,
        ) },
        topLightTransition: { value: new Vector3(
          lightTransition.top.startsAtMeters,
          lightTransition.top.endsAtMeters,
          lightTransition.top.curveStrength,
        ) },
      } : {}),
      verticalColorTransition: {
        value: new Vector2(
          profile.colors.verticalColorTransition.startsAtBladeRatio,
          profile.colors.verticalColorTransition.endsAtBladeRatio,
        ),
      },
      ...('target' in distanceColor ? {
        groundPatchField: { value: groundTexture },
        groundBaseColor: { value: new Color(groundField!.baseColor) },
        groundBrightnessVariation: { value: groundField!.brightnessVariation },
        groundOrigin: { value: new Vector2(groundField!.originX, groundField!.originY) },
        groundExtent: { value: new Vector2(
          groundField!.width * groundField!.texelSizeUnits,
          groundField!.height * groundField!.texelSizeUnits,
        ) },
        bottomGroundTransition: { value: new Vector3(
          distanceColor.bottom.startsAtMeters, distanceColor.bottom.endsAtMeters,
          distanceColor.bottom.curveStrength,
        ) },
        topGroundTransition: { value: new Vector3(
          distanceColor.top.startsAtMeters, distanceColor.top.endsAtMeters,
          distanceColor.top.curveStrength,
        ) },
      } : {
        distanceColorFarTint: { value: new Color(distanceColor.farTint) },
        distanceColorRange: {
          value: new Vector2(distanceColor.startsAtMeters, distanceColor.endsAtMeters),
        },
        distanceColorCurveStrength: { value: distanceColor.curveStrength },
      }),
    },
  });
}

function createGrassBladeGeometry(bladeSegments: number): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= bladeSegments; row += 1) {
    const heightRatio = row / bladeSegments;
    positions.push(-0.5, heightRatio, 0, 0.5, heightRatio, 0);
  }
  for (let segment = 0; segment < bladeSegments; segment += 1) {
    const lowerLeft = segment * 2;
    const lowerRight = lowerLeft + 1;
    const upperLeft = lowerLeft + 2;
    const upperRight = lowerLeft + 3;
    indices.push(
      lowerLeft, lowerRight, upperRight,
      lowerLeft, upperRight, upperLeft,
    );
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

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
