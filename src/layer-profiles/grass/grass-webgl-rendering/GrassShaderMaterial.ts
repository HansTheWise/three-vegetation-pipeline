import {
  Color,
  DoubleSide,
  Vector2,
  Vector3,
  type ShaderMaterial,
} from 'three';

import type { Axis } from '../../../offline/offline-compilation-orchestration/VegetationCompilerConfig.js';
import type { WebGLVegetationLightingMaterialFactory } from '../../../runtime/vegetation-layer-rendering-contracts/WebGLVegetationLightingMaterialFactory.js';
import type { WebGLSharedVegetationResources } from '../../../runtime/webgl-vegetation-resource-management/WebGLSharedVegetationResources.js';
import type { WebGLActiveCellIndexTexture } from '../../reusable-profile-features/render-tile-density-selection/webgl/WebGLActiveCellIndexTexture.js';
import type { WebGLVisibleRenderTileTexture } from '../../reusable-profile-features/render-tile-density-selection/webgl/WebGLVisibleRenderTileTexture.js';
import type { GrassRuntimeLayer } from '../grass-layer-preparation/GrassLayerPreparation.js';
import type { WebGLGrassLayerResources } from './WebGLGrassLayerResources.js';
import { grassFragmentShader } from './shaders/grassFragmentShader.js';
import { grassVertexShader } from './shaders/grassVertexShader.js';

type CreateGrassShaderMaterialOptions = Readonly<{
  sharedResources: WebGLSharedVegetationResources;
  layer: GrassRuntimeLayer;
  candidateCapacity: number;
  visibleRenderTileTexture: WebGLVisibleRenderTileTexture;
  activeCellIndexTexture: WebGLActiveCellIndexTexture;
  cameraPositionModel: Vector3;
  layerResources: WebGLGrassLayerResources;
  lightingMaterialFactory: WebGLVegetationLightingMaterialFactory;
}>;

/** Binds prepared Grass data and shared VEGFILE textures to one bucket material. */
export function createGrassShaderMaterial(
  options: CreateGrassShaderMaterialOptions,
): ShaderMaterial {
  const { sharedResources, layer } = options;
  const layerId = layer.layerId;
  const patternResource = options.layerResources.pattern;
  const { header } = sharedResources.dataset.file;
  const [horizontalAxisA, horizontalAxisB] = header.coordinateSystem.horizontalAxes;
  const unitsPerMeter = header.coordinateSystem.unitsPerMeter;
  const grassLayerConfig = layer.config;
  const grassRenderProfile = grassLayerConfig.renderProfile;
  const distanceColorTransition = grassRenderProfile.colors.distanceColorTransition;
  const groundColorFade = 'target' in distanceColorTransition
    ? distanceColorTransition
    : undefined;
  const farColorTransition = 'target' in distanceColorTransition
    ? undefined
    : distanceColorTransition;
  const groundColorAdaptation = grassRenderProfile.colors.groundColorAdaptation;
  const usesGroundColor = groundColorFade !== undefined || groundColorAdaptation !== undefined;
  const groundPatchField = layer.preparedProfileData.groundPatchField;
  const groundPatchTexture = options.layerResources.groundPatchField?.texture;
  if (usesGroundColor && (!groundPatchField || !groundPatchTexture)) {
    throw new Error(`Grass layer ${layerId} needs a ground patch field for its color processing.`);
  }
  const cloverConfig = grassRenderProfile.clover?.enabled
    ? grassRenderProfile.clover
    : undefined;
  if (cloverConfig && !groundColorAdaptation) {
    throw new Error(`Grass layer ${layerId} needs ground color adaptation for Clover.`);
  }
  const bladeThicknessScaling = grassRenderProfile.bladeThicknessDistanceScaling;
  const lightDistanceTransition = grassLayerConfig.lighting.distanceTransition;
  const lightingNormal = grassLayerConfig.lighting.normal;

  return options.lightingMaterialFactory.createVegetationLightingMaterial({
    name: `vegetation/grass-layer-${layerId}-density-${options.candidateCapacity}`,
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    side: DoubleSide,
    defines: {
      ...(usesGroundColor ? { GROUND_COLOR_SOURCE: 1 } : {}),
      ...(groundColorFade ? { GROUND_COLOR_FADE: 1 } : {}),
      ...(cloverConfig ? { CLOVER: 1 } : {}),
      ...(lightDistanceTransition ? { LIGHT_DISTANCE_TRANSITION: 1 } : {}),
      ...(lightingNormal.source === 'geometry' ? { LIGHTING_NORMAL_GEOMETRY: 1 } : {}),
      ...(lightingNormal.source === 'mixed' ? { LIGHTING_NORMAL_MIXED: 1 } : {}),
    },
    uniforms: {
      visibleTileRecords: { value: options.visibleRenderTileTexture.texture },
      visibleTileTextureWidth: { value: options.visibleRenderTileTexture.textureWidth },
      activeCellIndices: { value: options.activeCellIndexTexture.texture },
      activeCellTextureWidth: { value: options.activeCellIndexTexture.textureWidth },
      tileRecordOffset: { value: 0 },
      bucketCandidateCapacity: { value: options.candidateCapacity },
      storedChunkGridCoordinates: {
        value: sharedResources.vegFileTextures.storedChunkGridCoordinatesTexture,
      },
      chunkHeightRanges: {
        value: sharedResources.vegFileTextures.chunkHeightRangesTexture,
      },
      heightData: { value: sharedResources.vegFileTextures.heightDataTexture },
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
          grassRenderProfile.blade.heightMeters.minimum * unitsPerMeter,
          grassRenderProfile.blade.heightMeters.maximum * unitsPerMeter,
        ),
      },
      bladeWidth: {
        value: new Vector2(
          grassRenderProfile.blade.widthMeters.minimum * unitsPerMeter,
          grassRenderProfile.blade.widthMeters.maximum * unitsPerMeter,
        ),
      },
      bladeTopWidthRatio: { value: grassRenderProfile.blade.topWidthRatio },
      maximumBladeTiltRadians: {
        value: degreesToRadians(grassRenderProfile.blade.maximumTiltDegrees),
      },
      cameraFacingDistance: {
        value: new Vector2(
          grassRenderProfile.blade.cameraFacing.startsAtMeters,
          grassRenderProfile.blade.cameraFacing.reachesFullAtMeters,
        ),
      },
      maximumBladeOffset: {
        value: grassLayerConfig.distribution.elementRadiusMeters * unitsPerMeter,
      },
      useTwoSampleHeight: {
        value: grassRenderProfile.blade.heightSampling === 'diagonal-average',
      },
      bladeThicknessDistance: {
        value: new Vector2(
          bladeThicknessScaling.startsIncreasingAtMeters,
          bladeThicknessScaling.reachesMaximumAtMeters,
        ),
      },
      bladeThicknessScale: {
        value: new Vector2(
          bladeThicknessScaling.defaultScale,
          bladeThicknessScaling.maximumScale,
        ),
      },
      bladeThicknessCurveStrength: { value: bladeThicknessScaling.curveStrength },
      lightWeights: { value: new Vector2(
        grassLayerConfig.lighting.directLightWeight,
        grassLayerConfig.lighting.indirectLightWeight,
      ) },
      ...(lightingNormal.source === 'mixed'
        ? { groundNormalWeight: { value: lightingNormal.groundWeight } }
        : {}),
      ...(lightDistanceTransition ? {
        distanceLightWeights: { value: new Vector2(
          lightDistanceTransition.directLightWeight,
          lightDistanceTransition.indirectLightWeight,
        ) },
        bottomLightTransition: { value: new Vector3(
          lightDistanceTransition.bottom.startsAtMeters,
          lightDistanceTransition.bottom.endsAtMeters,
          lightDistanceTransition.bottom.curveStrength,
        ) },
        topLightTransition: { value: new Vector3(
          lightDistanceTransition.top.startsAtMeters,
          lightDistanceTransition.top.endsAtMeters,
          lightDistanceTransition.top.curveStrength,
        ) },
      } : {}),
      verticalColorTransition: {
        value: new Vector2(
          grassRenderProfile.colors.verticalColorTransition.startsAtBladeRatio,
          grassRenderProfile.colors.verticalColorTransition.endsAtBladeRatio,
        ),
      },
      ...(usesGroundColor ? {
        groundPatchField: { value: groundPatchTexture },
        groundBaseColor: { value: new Color(groundPatchField!.baseColor) },
        groundBrightnessVariation: { value: groundPatchField!.brightnessVariation },
        groundOrigin: {
          value: new Vector2(groundPatchField!.originX, groundPatchField!.originY),
        },
        groundExtent: { value: new Vector2(
          groundPatchField!.width * groundPatchField!.texelSizeUnits,
          groundPatchField!.height * groundPatchField!.texelSizeUnits,
        ) },
        groundColorBias: { value: new Vector2(
          groundColorAdaptation?.bottomBias ?? 0,
          groundColorAdaptation?.topBias ?? 0,
        ) },
        ...(groundColorFade ? {
          bottomGroundTransition: { value: new Vector3(
            groundColorFade.bottom.startsAtMeters,
            groundColorFade.bottom.endsAtMeters,
            groundColorFade.bottom.curveStrength,
          ) },
          topGroundTransition: { value: new Vector3(
            groundColorFade.top.startsAtMeters,
            groundColorFade.top.endsAtMeters,
            groundColorFade.top.curveStrength,
          ) },
        } : {}),
        ...(cloverConfig ? {
          cloverTexture: { value: options.layerResources.cloverTexture!.texture },
          cloverMaximumRatio: { value: cloverConfig.maximumRatio },
          cloverGroundColorBias: { value: cloverConfig.groundColorBias },
          cloverPreferredGroundColor: { value: new Color(cloverConfig.preferredGroundColor) },
          cloverColorTolerance: { value: cloverConfig.colorTolerance },
          cloverSize: { value: new Vector2(
            cloverConfig.sizeMeters.minimum * unitsPerMeter,
            cloverConfig.sizeMeters.maximum * unitsPerMeter,
          ) },
          cloverHeightOffset: { value: cloverConfig.heightOffsetMeters * unitsPerMeter },
          cloverBaseColor: { value: new Color(cloverConfig.baseColor) },
          cloverHighlightColor: { value: new Color(cloverConfig.highlightColor) },
        } : {}),
      } : {}),
      ...(farColorTransition ? {
        distanceColorFarTint: { value: new Color(farColorTransition.farTint) },
        distanceColorRange: {
          value: new Vector2(
            farColorTransition.startsAtMeters,
            farColorTransition.endsAtMeters,
          ),
        },
        distanceColorCurveStrength: { value: farColorTransition.curveStrength },
      } : {}),
    },
  });
}

function createAxisVector(axis: Axis): Vector3 {
  if (axis === 'x') return new Vector3(1, 0, 0);
  if (axis === 'y') return new Vector3(0, 1, 0);
  return new Vector3(0, 0, 1);
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
