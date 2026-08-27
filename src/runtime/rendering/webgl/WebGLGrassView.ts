import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

import type { Axis } from '../../../offline/config/types.js';
import { WebGLVisibleTileBuffer } from '../../gpu/webgl/WebGLVisibleTileBuffer.js';
import type { WebGLVegetationAdapter } from '../../gpu/webgl/WebGLVegetationAdapter.js';
import {
  createCellPermutationStride,
  VegetationRenderTileLod,
} from '../../lod/VegetationRenderTileLod.js';
import type { ModelPosition } from '../../lod/types.js';
import { grassFragmentShader } from './shaders/grassFragmentShader.js';
import { grassVertexShader } from './shaders/grassVertexShader.js';

const MAXIMUM_WEBGL_INSTANCE_COUNT = 0x8000_0000;

export type WebGLGrassLodDraw = Readonly<{
  cellCount: number;
  anchorCount: number;
  elementCount: number;
  bladeSegments: number;
  candidatesPerTile: number;
  geometry: InstancedBufferGeometry;
  material: RawShaderMaterial;
  mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  tileBuffer: WebGLVisibleTileBuffer;
}>;

/** Draws distance-bucketed grass blades for deterministic Cell prefixes. */
export class WebGLGrassView {
  readonly geometry: InstancedBufferGeometry;
  readonly material: RawShaderMaterial;
  readonly mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  readonly lodDraws: readonly WebGLGrassLodDraw[];
  readonly layerId: number;
  readonly candidatesPerVisibleChunk: number;
  readonly tileLod: VegetationRenderTileLod;

  readonly #adapter: WebGLVegetationAdapter;
  readonly #cameraPositionModel = new Vector3();

  constructor(adapter: WebGLVegetationAdapter, layerId: number) {
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
    this.#adapter = adapter;
    this.layerId = layerId;
    this.tileLod = new VegetationRenderTileLod(adapter.dataset, layerId);
    this.candidatesPerVisibleChunk = layerMask.maskResolution ** 2
      * patternResource.patternSet.anchorsPerPattern
      * layer.config.bladeCount.maximumPerAnchor;
    const maximumInstanceCount = adapter.staticResources.header.storedChunkCount
      * this.candidatesPerVisibleChunk;
    if (!Number.isSafeInteger(maximumInstanceCount)
      || maximumInstanceCount > MAXIMUM_WEBGL_INSTANCE_COUNT) {
      throw new Error(`Grass layer ${layerId} exceeds the safe WebGL instance range.`);
    }

    const draws = this.tileLod.levels.map((level, levelIndex) => {
      const nextLevel = this.tileLod.levels[levelIndex + 1] ?? level;
      const bladeSegments = level.bladeSegments;
      const tileBuffer = new WebGLVisibleTileBuffer(
        adapter.renderer,
        this.tileLod.tileCapacity,
        `vegetation/layer-${layerId}-lod-${levelIndex}-tiles`,
      );
      const geometry = createGrassBladeGeometry(bladeSegments);
      const material = createGrassMaterial({
        adapter,
        layerId,
        levelIndex,
        tileBuffer,
        renderTileSizeCells: this.tileLod.renderTileSizeCells,
        visibleCellCount: level.cellCount,
        cellPermutationStride: createCellPermutationStride(this.tileLod.renderTileSizeCells),
        visibleAnchorCount: level.anchorCount,
        visibleElementCount: level.elementCount,
        finalLodLevel: levelIndex === this.tileLod.levels.length - 1,
        nextCellCount: nextLevel.cellCount,
        nextAnchorCount: nextLevel.anchorCount,
        nextElementCount: nextLevel.elementCount,
        lodFadeRange: new Vector2(
          this.tileLod.fadeStartsMeters[levelIndex],
          this.tileLod.fadeEndsMeters[levelIndex],
        ),
        cameraPositionModel: this.#cameraPositionModel,
        useTwoSampleHeight: level.heightSampling === 'diagonal-average',
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = `vegetation/grass-layer-${layerId}-lod-${levelIndex}`;
      mesh.frustumCulled = false;
      return {
        cellCount: level.cellCount,
        anchorCount: level.anchorCount,
        elementCount: level.elementCount,
        bladeSegments,
        candidatesPerTile: level.cellCount * level.anchorCount
          * level.elementCount,
        geometry,
        material,
        mesh,
        tileBuffer,
      };
    });
    this.lodDraws = draws;
    this.geometry = draws[0]!.geometry;
    this.material = draws[0]!.material;
    this.mesh = draws[0]!.mesh;
    for (let levelIndex = 1; levelIndex < draws.length; levelIndex += 1) {
      this.mesh.add(draws[levelIndex]!.mesh);
    }
  }

  get visibleTileCount(): number {
    return this.lodDraws.reduce((sum, draw) => sum + draw.tileBuffer.visibleTileCount, 0);
  }

  get visibleCandidateCount(): number {
    return this.lodDraws.reduce((sum, draw) => sum + draw.geometry.instanceCount, 0);
  }

  /** Applies the same model-space light used by the surrounding scene. */
  setLighting(
    directionalLightDirection: Vector3,
    ambientLightColor: Color,
    directionalLightColor: Color,
  ): void {
    for (const draw of this.lodDraws) {
      draw.material.uniforms.directionalLightDirection!.value
        .copy(directionalLightDirection)
        .normalize();
      draw.material.uniforms.ambientLightColor!.value.copy(ambientLightColor);
      draw.material.uniforms.directionalLightColor!.value.copy(directionalLightColor);
    }
  }

  /** Updates tile distance buckets from the same model-local camera used for culling. */
  updateLod(cameraPositionModel: ModelPosition): void {
    this.#cameraPositionModel.set(
      cameraPositionModel.x,
      cameraPositionModel.y,
      cameraPositionModel.z,
    );
    const visibleChunks = this.#adapter.visibleChunkBuffer;
    this.tileLod.update(
      visibleChunks.data,
      visibleChunks.visibleChunkCount,
      cameraPositionModel,
    );
    this.lodDraws.forEach((draw, levelIndex) => {
      const tileCount = this.tileLod.tileCounts[levelIndex]!;
      draw.tileBuffer.update(this.tileLod.levels[levelIndex]!.tileRecords, tileCount);
      draw.geometry.instanceCount = tileCount * draw.candidatesPerTile;
    });
  }

  dispose(): void {
    for (const draw of this.lodDraws) {
      draw.geometry.dispose();
      draw.material.dispose();
      draw.tileBuffer.dispose();
    }
  }
}

type GrassMaterialOptions = Readonly<{
  adapter: WebGLVegetationAdapter;
  layerId: number;
  levelIndex: number;
  tileBuffer: WebGLVisibleTileBuffer;
  renderTileSizeCells: number;
  visibleCellCount: number;
  cellPermutationStride: number;
  visibleAnchorCount: number;
  visibleElementCount: number;
  finalLodLevel: boolean;
  nextCellCount: number;
  nextAnchorCount: number;
  nextElementCount: number;
  lodFadeRange: Vector2;
  cameraPositionModel: Vector3;
  useTwoSampleHeight: boolean;
}>;

function createGrassMaterial(options: GrassMaterialOptions): RawShaderMaterial {
  const { adapter, layerId } = options;
  const layer = adapter.dataset.enabledLayers.find((candidate) => candidate.layerId === layerId)!;
  const patternResource = adapter.staticResources.patterns.find(
    (candidate) => candidate.layerId === layerId,
  )!;
  const layerMask = adapter.staticResources.layerMasks.find(
    (candidate) => candidate.layerId === layerId,
  )!;
  const { header } = adapter.staticResources;
  const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
  const unitsPerMeter = header.coordinateSystem.unitsPerMeter;
  const axisA = createAxisVector(horizontalAxisA);
  const axisB = createAxisVector(horizontalAxisB);
  const up = createAxisVector(header.coordinateSystem.upAxis);
  const directionalLightDirection = up.clone()
    .addScaledVector(axisA, 0.35)
    .addScaledVector(axisB, 0.2)
    .normalize();
  const distanceColor = layer.config.colors.distanceColorTransition;
  const thickness = layer.config.bladeThicknessDistanceScaling;
  return new RawShaderMaterial({
    name: `vegetation/grass-layer-${layerId}-lod-${options.levelIndex}`,
    glslVersion: GLSL3,
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    side: DoubleSide,
    uniforms: {
      visibleTileRecords: { value: options.tileBuffer.texture },
      visibleTileTextureWidth: { value: options.tileBuffer.textureWidth },
      storedChunkGridCoordinates: {
        value: adapter.staticResources.storedChunkGridCoordinatesTexture,
      },
      chunkHeightRanges: { value: adapter.staticResources.chunkHeightRangesTexture },
      heightData: { value: adapter.staticResources.heightDataTexture },
      layerMask: { value: layerMask.texture },
      patternPositions: { value: patternResource.texture },
      bottomColors: { value: patternResource.bottomColors.texture },
      topColors: { value: patternResource.topColors.texture },
      seed: { value: header.seed },
      layerId: { value: layerId },
      patternCount: { value: patternResource.patternSet.patternCount },
      maskResolution: { value: layerMask.maskResolution },
      renderTileSizeCells: { value: options.renderTileSizeCells },
      visibleCellCount: { value: options.visibleCellCount },
      visibleAnchorCount: { value: options.visibleAnchorCount },
      visibleElementCount: { value: options.visibleElementCount },
      cellPermutationStride: { value: options.cellPermutationStride },
      finalLodLevel: { value: options.finalLodLevel },
      nextCellCount: { value: options.nextCellCount },
      nextAnchorCount: { value: options.nextAnchorCount },
      nextElementCount: { value: options.nextElementCount },
      lodFadeRange: { value: options.lodFadeRange },
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
      horizontalAxisA: { value: axisA },
      horizontalAxisB: { value: axisB },
      upAxis: { value: up },
      bladeHeight: {
        value: new Vector2(
          layer.config.blade.heightMeters.minimum * unitsPerMeter,
          layer.config.blade.heightMeters.maximum * unitsPerMeter,
        ),
      },
      bladeWidth: {
        value: new Vector2(
          layer.config.blade.widthMeters.minimum * unitsPerMeter,
          layer.config.blade.widthMeters.maximum * unitsPerMeter,
        ),
      },
      bladeTopWidthRatio: { value: layer.config.blade.topWidthRatio },
      maximumBladeTiltRadians: {
        value: degreesToRadians(layer.config.blade.maximumTiltDegrees),
      },
      maximumBladeOffset: {
        value: layer.config.bladeCount.maximumOffsetMeters * unitsPerMeter,
      },
      lodTransitionStartVisibleRatio: {
        value: layer.config.bladeCount.lodTransitionStartVisibleRatio,
      },
      useTwoSampleHeight: { value: options.useTwoSampleHeight },
      bladeThicknessDistance: {
        value: new Vector2(thickness.startsIncreasingAtMeters, thickness.reachesMaximumAtMeters),
      },
      bladeThicknessScale: { value: new Vector2(thickness.defaultScale, thickness.maximumScale) },
      bladeThicknessCurveStrength: { value: thickness.curveStrength },
      verticalColorTransition: {
        value: new Vector2(
          layer.config.colors.verticalColorTransition.startsAtBladeRatio,
          layer.config.colors.verticalColorTransition.endsAtBladeRatio,
        ),
      },
      distanceColorFarTint: { value: new Color(distanceColor.farTint) },
      distanceColorRange: {
        value: new Vector2(distanceColor.startsAtMeters, distanceColor.endsAtMeters),
      },
      distanceColorCurveStrength: { value: distanceColor.curveStrength },
      lightingNormalUpBias: { value: layer.config.lighting.normalUpBias },
      directionalLightDirection: { value: directionalLightDirection },
      ambientLightColor: { value: new Color(0.65, 0.65, 0.65) },
      directionalLightColor: { value: new Color(0.35, 0.35, 0.35) },
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
