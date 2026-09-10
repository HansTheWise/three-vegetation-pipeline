import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
} from 'three';

import type { Axis } from '../../../offline/config/types.js';
import type { ClipSpaceDepthRange, Matrix4Elements } from '../../chunking/types.js';
import { VegetationRenderTileDensity } from '../../density/VegetationRenderTileDensity.js';
import type { ModelPosition, VegetationActiveCellData } from '../../density/types.js';
import { WebGLActiveCellBuffer } from '../../gpu/webgl/WebGLActiveCellBuffer.js';
import { validateWebGLInstanceCount } from '../../gpu/webgl/limits.js';
import { WebGLVisibleTileBuffer } from '../../gpu/webgl/WebGLVisibleTileBuffer.js';
import type { WebGLVegetationAdapter } from '../../gpu/webgl/WebGLVegetationAdapter.js';
import {
  requireGrassRuntimeLayerConfig,
} from '../../profiles/grass/GrassRenderProfile.js';
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
export class WebGLGrassView {
  readonly geometry: InstancedBufferGeometry;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly densityDraws: readonly WebGLGrassDensityDraw[];
  readonly layerId: number;
  readonly candidatesPerVisibleChunk: number;
  readonly tileDensity: VegetationRenderTileDensity;
  readonly tileBuffer: WebGLVisibleTileBuffer;
  readonly activeCellBuffer: WebGLActiveCellBuffer;

  readonly #adapter: WebGLVegetationAdapter;
  readonly #cameraPositionModel = new Vector3();

  constructor(
    adapter: WebGLVegetationAdapter,
    layerId: number,
    preparedCells?: VegetationActiveCellData,
  ) {
    const layer = adapter.dataset.enabledLayers.find(
      (candidate) => candidate.layerId === layerId,
    );
    if (!layer) {
      throw new Error(`Enabled runtime grass layer ${layerId} does not exist.`);
    }
    const patternResource = adapter.staticResources.patterns.find(
      (candidate) => candidate.layerId === layerId,
    );
    const layerMask = adapter.staticResources.layerMasks.find(
      (candidate) => candidate.layerId === layerId,
    );
    if (!patternResource || !layerMask) {
      throw new Error(`Runtime grass layer ${layerId} has incomplete WebGL resources.`);
    }
    const grassLayer = requireGrassRuntimeLayerConfig(layer.config);
    const profile = grassLayer.renderProfile;
    this.#adapter = adapter;
    this.layerId = layerId;
    this.tileDensity = new VegetationRenderTileDensity(adapter.dataset, layerId, preparedCells);
    this.candidatesPerVisibleChunk = layerMask.maskResolution ** 2
      * patternResource.patternSet.anchorsPerPattern
      * layer.config.distribution.elementsPerAnchor;
    const maximumInstanceCount = this.tileDensity.tileCapacity
      * this.tileDensity.maximumCandidatesPerTile;
    validateWebGLInstanceCount(maximumInstanceCount, `Grass layer ${layerId}`);

    let tileBuffer: WebGLVisibleTileBuffer | undefined;
    let activeCellBuffer: WebGLActiveCellBuffer | undefined;
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
          });
        } catch (error) {
          geometry.dispose();
          throw error;
        }
        const mesh = new Mesh(geometry, material);
        mesh.name = `vegetation/grass-layer-${layerId}-density-${candidateCapacity}`;
        mesh.frustumCulled = false;
        mesh.castShadow = grassLayer.shadows.cast;
        mesh.receiveShadow = grassLayer.shadows.receive;
        densityDraws.push({ bucketIndex, candidateCapacity, geometry, material, mesh });
      });
    } catch (error) {
      for (let index = densityDraws.length - 1; index >= 0; index -= 1) {
        densityDraws[index]!.geometry.dispose();
        densityDraws[index]!.material.dispose();
      }
      activeCellBuffer?.dispose();
      tileBuffer?.dispose();
      throw error;
    }
    this.tileBuffer = tileBuffer;
    this.activeCellBuffer = activeCellBuffer;
    this.densityDraws = densityDraws;
    this.geometry = this.densityDraws[0]!.geometry;
    this.material = this.densityDraws[0]!.material;
    this.mesh = this.densityDraws[0]!.mesh;
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
    for (const draw of this.densityDraws) {
      draw.geometry.dispose();
      draw.material.dispose();
    }
    this.tileBuffer.dispose();
    this.activeCellBuffer.dispose();
  }
}

type GrassMaterialOptions = Readonly<{
  adapter: WebGLVegetationAdapter;
  layerId: number;
  candidateCapacity: number;
  tileBuffer: WebGLVisibleTileBuffer;
  activeCellBuffer: WebGLActiveCellBuffer;
  cameraPositionModel: Vector3;
}>;

function createGrassMaterial(options: GrassMaterialOptions): ShaderMaterial {
  const { adapter, layerId } = options;
  const layer = adapter.dataset.enabledLayers.find((candidate) => candidate.layerId === layerId)!;
  const patternResource = adapter.staticResources.patterns.find(
    (candidate) => candidate.layerId === layerId,
  )!;
  const { header } = adapter.staticResources;
  const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
  const unitsPerMeter = header.coordinateSystem.unitsPerMeter;
  const grassLayer = requireGrassRuntimeLayerConfig(layer.config);
  const profile = grassLayer.renderProfile;
  const distanceColor = profile.colors.distanceColorTransition;
  const groundTransition = 'target' in distanceColor ? distanceColor : undefined;
  const groundField = layer.groundPatchField;
  const groundTexture = adapter.staticResources.groundPatchFields.find(
    (field) => field.layerId === layerId,
  )?.texture;
  if (groundTransition && (!groundField || !groundTexture)) {
    throw new Error(`Grass layer ${layerId} needs a ground patch field for its color transition.`);
  }
  const thickness = profile.bladeThicknessDistanceScaling;
  return new ShaderMaterial({
    name: `vegetation/grass-layer-${layerId}-density-${options.candidateCapacity}`,
    glslVersion: GLSL3,
    lights: true,
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    side: DoubleSide,
    defines: groundTransition ? { GROUND_COLOR_TRANSITION: 1 } : {},
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.lights),
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
        value: layer.config.distribution.elementRadiusMeters * unitsPerMeter,
      },
      useTwoSampleHeight: {
        value: profile.blade.heightSampling === 'diagonal-average',
      },
      bladeThicknessDistance: {
        value: new Vector2(thickness.startsIncreasingAtMeters, thickness.reachesMaximumAtMeters),
      },
      bladeThicknessScale: { value: new Vector2(thickness.defaultScale, thickness.maximumScale) },
      bladeThicknessCurveStrength: { value: thickness.curveStrength },
      directLightWeight: { value: grassLayer.lighting.directLightWeight },
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
