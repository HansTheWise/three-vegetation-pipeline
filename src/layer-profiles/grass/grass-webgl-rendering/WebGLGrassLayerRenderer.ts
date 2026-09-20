import {
  Group,
  Mesh,
  Vector3,
  type InstancedBufferGeometry,
  type ShaderMaterial,
} from 'three';

import { createThreeWebGLVegetationLightingMaterialFactory } from '../../../runtime/threejs-runtime-integration/ThreeWebGLVegetationLightingMaterialFactory.js';
import type { ClipSpaceDepthRange, Matrix4Elements } from '../../../runtime/stored-chunk-visibility/frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';
import type { VegetationFrameState } from '../../../runtime/vegetation-runtime-orchestration/VegetationFrameState.js';
import type {
  WebGLVegetationLayerRenderer,
  WebGLVegetationLayerRendererDiagnostics,
} from '../../../runtime/vegetation-layer-rendering-contracts/WebGLVegetationLayerRenderer.js';
import type { WebGLVegetationLightingMaterialFactory } from '../../../runtime/vegetation-layer-rendering-contracts/WebGLVegetationLightingMaterialFactory.js';
import type { WebGLSharedVegetationResources } from '../../../runtime/webgl-vegetation-resource-management/WebGLSharedVegetationResources.js';
import { validateWebGLInstanceCount } from '../../../runtime/webgl-vegetation-resource-management/WebGLResourceLimits.js';
import type { ModelPosition } from '../../reusable-profile-features/render-tile-density-selection/DensitySelectionTypes.js';
import { VegetationRenderTileDensity } from '../../reusable-profile-features/render-tile-density-selection/VegetationRenderTileDensity.js';
import { WebGLActiveCellIndexTexture } from '../../reusable-profile-features/render-tile-density-selection/webgl/WebGLActiveCellIndexTexture.js';
import { WebGLVisibleRenderTileTexture } from '../../reusable-profile-features/render-tile-density-selection/webgl/WebGLVisibleRenderTileTexture.js';
import type { GrassRuntimeLayer } from '../grass-layer-preparation/GrassLayerPreparation.js';
import { createGrassBladeGeometry } from './GrassBladeGeometry.js';
import { createGrassShaderMaterial } from './GrassShaderMaterial.js';
import type { WebGLGrassGroundPatchSurface } from './WebGLGrassGroundPatchSurface.js';
import { WebGLGrassLayerResources } from './WebGLGrassLayerResources.js';

const MATRIX_4_ELEMENT_COUNT = 16;

export type WebGLGrassCandidateCapacityDraw = Readonly<{
  bucketIndex: number;
  candidateCapacity: number;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
}>;

export type WebGLGrassLayerRendererOptions = Readonly<{
  sharedResources: WebGLSharedVegetationResources;
  layer: GrassRuntimeLayer;
  lightingMaterialFactory?: WebGLVegetationLightingMaterialFactory;
  groundPatchSurface?: WebGLGrassGroundPatchSurface;
  /** Low-level comparison seam used by the render-submission benchmark. */
  candidateCapacityBuckets?: Uint32Array;
}>;

/** Owns rendering and frame updates for one prepared Grass layer. */
export class WebGLGrassLayerRenderer implements WebGLVegetationLayerRenderer {
  readonly object3d = new Group();
  readonly candidateCapacityDraws: readonly WebGLGrassCandidateCapacityDraw[];
  readonly layerResources: WebGLGrassLayerResources;
  readonly layerId: number;
  readonly renderTileDensitySelection: VegetationRenderTileDensity;
  readonly visibleRenderTileTexture: WebGLVisibleRenderTileTexture;
  readonly activeCellIndexTexture: WebGLActiveCellIndexTexture;

  readonly #sharedResources: WebGLSharedVegetationResources;
  readonly #cameraPositionModel = new Vector3();
  readonly #previousCameraPositionModel = new Vector3();
  readonly #previousClipFromModelMatrix = new Float64Array(MATRIX_4_ELEMENT_COUNT);
  readonly #removeGroundPatchSurface: () => void;
  #hasPreviousFrameSelection = false;
  #previousClipSpaceDepthRange: ClipSpaceDepthRange = 'negative-one-to-one';
  #previousVisibleStoredChunkSelectionRevision = -1;

  constructor(options: WebGLGrassLayerRendererOptions) {
    const {
      sharedResources,
      layer,
      groundPatchSurface,
      candidateCapacityBuckets,
    } = options;
    const lightingMaterialFactory = options.lightingMaterialFactory
      ?? createThreeWebGLVegetationLightingMaterialFactory();
    const grassRenderProfile = layer.config.renderProfile;
    this.#sharedResources = sharedResources;
    this.layerId = layer.layerId;
    this.object3d.name = `vegetation/grass-layer-${layer.layerId}`;
    this.renderTileDensitySelection = new VegetationRenderTileDensity(
      sharedResources.dataset,
      layer.layerId,
      layer.preparedProfileData.activeCells,
      candidateCapacityBuckets,
    );
    const maximumInstanceCount = this.renderTileDensitySelection.tileCapacity
      * this.renderTileDensitySelection.maximumCandidatesPerTile;
    validateWebGLInstanceCount(maximumInstanceCount, `Grass layer ${layer.layerId}`);

    const layerResources = new WebGLGrassLayerResources(sharedResources.renderer, layer);
    let visibleRenderTileTexture: WebGLVisibleRenderTileTexture | undefined;
    let activeCellIndexTexture: WebGLActiveCellIndexTexture | undefined;
    let removeGroundPatchSurface: () => void = () => undefined;
    const candidateCapacityDraws: WebGLGrassCandidateCapacityDraw[] = [];
    try {
      visibleRenderTileTexture = new WebGLVisibleRenderTileTexture(
        sharedResources.renderer,
        this.renderTileDensitySelection.tileCapacity,
        `vegetation/layer-${layer.layerId}-density-tiles`,
      );
      activeCellIndexTexture = new WebGLActiveCellIndexTexture(
        sharedResources.renderer,
        this.renderTileDensitySelection.activeCellIndices,
        `vegetation/layer-${layer.layerId}-active-cells`,
      );
      for (let bucketIndex = 0;
        bucketIndex < this.renderTileDensitySelection.bucketCapacities.length;
        bucketIndex += 1) {
        const candidateCapacity = this.renderTileDensitySelection.bucketCapacities[bucketIndex]!;
        const geometry = createGrassBladeGeometry(grassRenderProfile.blade.segments);
        let material: ShaderMaterial;
        try {
          material = createGrassShaderMaterial({
            sharedResources,
            layer,
            candidateCapacity,
            visibleRenderTileTexture,
            activeCellIndexTexture,
            cameraPositionModel: this.#cameraPositionModel,
            layerResources,
            lightingMaterialFactory,
          });
        } catch (error) {
          geometry.dispose();
          throw error;
        }
        const mesh = new Mesh(geometry, material);
        mesh.name = `vegetation/grass-layer-${layer.layerId}-density-${candidateCapacity}`;
        mesh.frustumCulled = false;
        mesh.castShadow = layer.config.shadows.cast;
        mesh.receiveShadow = layer.config.shadows.receive;
        candidateCapacityDraws.push({
          bucketIndex,
          candidateCapacity,
          geometry,
          material,
          mesh,
        });
        this.object3d.add(mesh);
      }
      const groundPatchField = layer.preparedProfileData.groundPatchField;
      const groundPatchTexture = layerResources.groundPatchField?.texture;
      if (groundPatchSurface && groundPatchField && groundPatchTexture) {
        removeGroundPatchSurface = groundPatchSurface.install({
          dataset: sharedResources.dataset,
          layer,
          field: groundPatchField,
          texture: groundPatchTexture,
        });
      }
    } catch (error) {
      removeGroundPatchSurface();
      for (let drawIndex = candidateCapacityDraws.length - 1;
        drawIndex >= 0;
        drawIndex -= 1) {
        candidateCapacityDraws[drawIndex]!.geometry.dispose();
        candidateCapacityDraws[drawIndex]!.material.dispose();
      }
      activeCellIndexTexture?.dispose();
      visibleRenderTileTexture?.dispose();
      layerResources.dispose();
      throw error;
    }
    this.layerResources = layerResources;
    this.visibleRenderTileTexture = visibleRenderTileTexture;
    this.activeCellIndexTexture = activeCellIndexTexture;
    this.#removeGroundPatchSurface = removeGroundPatchSurface;
    this.candidateCapacityDraws = candidateCapacityDraws;
  }

  get visibleTileCount(): number {
    return this.renderTileDensitySelection.visibleTileCount;
  }

  /** Exact visible blade count before candidate-capacity padding. */
  get visibleCandidateCount(): number {
    return this.renderTileDensitySelection.visibleCandidateCount;
  }

  /** Submitted blade instances including candidate-capacity padding. */
  get executedCandidateCount(): number {
    return this.candidateCapacityDraws.reduce(
      (submittedCandidateCount, draw) => (
        submittedCandidateCount + draw.geometry.instanceCount
      ),
      0,
    );
  }

  get frustumTestedTileCount(): number {
    return this.renderTileDensitySelection.frustumTestedTileCount;
  }

  get frustumCulledTileCount(): number {
    return this.renderTileDensitySelection.frustumCulledTileCount;
  }

  get diagnostics(): WebGLVegetationLayerRendererDiagnostics {
    return this;
  }

  updateFrame(frameState: VegetationFrameState): void {
    const visibleStoredChunkSelectionRevision = this.#sharedResources
      .visibleStoredChunkTexture.selectionRevision;
    if (this.#frameSelectionIsUnchanged(
      frameState,
      visibleStoredChunkSelectionRevision,
    )) return;

    this.updateRenderTileSelection(
      frameState.cameraPositionModel,
      frameState.clipFromModelMatrix,
      frameState.clipSpaceDepthRange,
    );
    this.#rememberFrameSelection(frameState, visibleStoredChunkSelectionRevision);
  }

  /** Updates Grass tile visibility, density budgets and bucket draw counts. */
  updateRenderTileSelection(
    cameraPositionModel: ModelPosition,
    clipFromModelMatrix?: Matrix4Elements,
    clipSpaceDepthRange: ClipSpaceDepthRange = 'negative-one-to-one',
  ): void {
    this.#cameraPositionModel.set(
      cameraPositionModel.x,
      cameraPositionModel.y,
      cameraPositionModel.z,
    );
    const visibleStoredChunkTexture = this.#sharedResources.visibleStoredChunkTexture;
    this.renderTileDensitySelection.update(
      visibleStoredChunkTexture.storedChunkIndexData,
      visibleStoredChunkTexture.visibleStoredChunkCount,
      cameraPositionModel,
      clipFromModelMatrix,
      clipSpaceDepthRange,
    );
    this.visibleRenderTileTexture.update(
      this.renderTileDensitySelection.renderTileRecords,
      this.renderTileDensitySelection.visibleTileCount,
    );
    for (const draw of this.candidateCapacityDraws) {
      const visibleTileCount = this.renderTileDensitySelection
        .bucketTileCounts[draw.bucketIndex]!;
      draw.material.uniforms.tileRecordOffset!.value = this.renderTileDensitySelection
        .bucketRecordOffsets[draw.bucketIndex]!;
      draw.geometry.instanceCount = visibleTileCount * draw.candidateCapacity;
    }
  }

  dispose(): void {
    this.#removeGroundPatchSurface();
    this.object3d.clear();
    for (const draw of this.candidateCapacityDraws) {
      draw.geometry.dispose();
      draw.material.dispose();
    }
    this.visibleRenderTileTexture.dispose();
    this.activeCellIndexTexture.dispose();
    this.layerResources.dispose();
  }

  #frameSelectionIsUnchanged(
    frameState: VegetationFrameState,
    visibleStoredChunkSelectionRevision: number,
  ): boolean {
    if (!this.#hasPreviousFrameSelection
      || visibleStoredChunkSelectionRevision
        !== this.#previousVisibleStoredChunkSelectionRevision
      || frameState.clipSpaceDepthRange !== this.#previousClipSpaceDepthRange
      || !this.#previousCameraPositionModel.equals(frameState.cameraPositionModel)) {
      return false;
    }
    for (let matrixElementIndex = 0;
      matrixElementIndex < MATRIX_4_ELEMENT_COUNT;
      matrixElementIndex += 1) {
      if (this.#previousClipFromModelMatrix[matrixElementIndex]
        !== frameState.clipFromModelMatrix[matrixElementIndex]) return false;
    }
    return true;
  }

  #rememberFrameSelection(
    frameState: VegetationFrameState,
    visibleStoredChunkSelectionRevision: number,
  ): void {
    this.#hasPreviousFrameSelection = true;
    this.#previousVisibleStoredChunkSelectionRevision = visibleStoredChunkSelectionRevision;
    this.#previousClipSpaceDepthRange = frameState.clipSpaceDepthRange;
    this.#previousCameraPositionModel.copy(frameState.cameraPositionModel);
    for (let matrixElementIndex = 0;
      matrixElementIndex < MATRIX_4_ELEMENT_COUNT;
      matrixElementIndex += 1) {
      this.#previousClipFromModelMatrix[matrixElementIndex] =
        frameState.clipFromModelMatrix[matrixElementIndex]!;
    }
  }
}
