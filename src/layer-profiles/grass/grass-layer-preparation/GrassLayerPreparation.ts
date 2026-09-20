import type { VegetationRuntimeLayerConfig } from '../../../runtime/runtime-dataset-preparation/configuration/VegetationRuntimeConfig.js';
import { createVegetationActiveCellDataForLayer } from '../../reusable-profile-features/render-tile-density-selection/VegetationRenderTileDensity.js';
import type { VegetationActiveCellData } from '../../reusable-profile-features/render-tile-density-selection/DensitySelectionTypes.js';
import type { VegetationRuntimeLayer } from '../../../runtime/runtime-dataset-preparation/dataset-construction/VegetationRuntimeDataset.js';
import type { ParsedVegFile, ParsedVegLayer } from '../../../runtime/vegfile-v2-parsing/ParsedVegetationFile.js';
import type {
  PreparedVegetationLayerProfile,
  VegetationLayerCullingBounds,
} from '../../../runtime/runtime-dataset-preparation/layer-profile-preparation/VegetationLayerPreparation.js';
import { createVegetationPatterns } from '../../reusable-profile-features/deterministic-pattern-generation/VegetationPatterns.js';
import type { VegetationPatternSet } from '../../reusable-profile-features/deterministic-pattern-generation/VegetationPatternTypes.js';
import {
  createGrassGroundPatchField,
} from '../grass-ground-patch-generation/createGrassGroundPatchField.js';
import type { GrassGroundPatchField } from '../grass-ground-patch-generation/GrassGroundPatchTypes.js';
import { requireGrassRuntimeLayerConfig } from '../grass-runtime-configuration/GrassRenderProfile.js';
import type { GrassRuntimeLayerConfig } from '../grass-runtime-configuration/GrassRuntimeConfig.js';
import { validateGrassRuntimeLayerConfig } from '../grass-runtime-configuration/validateGrassRuntimeLayerConfig.js';

export type GrassLayerPreparedData = Readonly<{
  patterns: VegetationPatternSet;
  activeCells: VegetationActiveCellData;
  groundPatchField: GrassGroundPatchField | undefined;
}>;

export type GrassRuntimeLayer = VegetationRuntimeLayer<
  GrassRuntimeLayerConfig,
  GrassLayerPreparedData
>;

export function prepareGrassLayerData(
  file: ParsedVegFile,
  fileLayer: ParsedVegLayer,
  storedChunkGridCoordinates: Uint32Array,
  config: GrassRuntimeLayerConfig,
): GrassLayerPreparedData {
  const groundPatchField = createGrassGroundPatchField(
    file,
    fileLayer.id,
    config.patches.ground,
  );
  const activeCells = createVegetationActiveCellDataForLayer(
    file,
    fileLayer,
    storedChunkGridCoordinates,
    fileLayer.id,
    config.density.renderTileSizeCells,
  );
  return {
    patterns: createVegetationPatterns(
      file.header.seed,
      { ...config.pattern, anchorsPerCell: config.distribution.anchorsPerCell },
    ),
    activeCells,
    groundPatchField,
  };
}

/** Derives the complete Grass geometry envelope used by shared and tile culling. */
export function calculateGrassLayerCullingBounds(
  config: GrassRuntimeLayerConfig,
): VegetationLayerCullingBounds {
  const profile = config.renderProfile;
  const maximumBladeHeightMeters = profile.blade.heightMeters.maximum;
  const maximumHalfBladeWidthMeters = profile.blade.widthMeters.maximum
    * profile.bladeThicknessDistanceScaling.maximumScale / 2;
  const maximumTiltRadians = profile.blade.maximumTiltDegrees * Math.PI / 180;
  const maximumCloverRadiusMeters = profile.clover?.enabled
    ? profile.clover.sizeMeters.maximum / 2
    : 0;
  return {
    horizontalPaddingMeters: config.distribution.elementRadiusMeters
      + Math.max(
        Math.sin(maximumTiltRadians) * maximumBladeHeightMeters
          + maximumHalfBladeWidthMeters,
        maximumCloverRadiusMeters,
      ),
    belowSurfaceMeters: 0,
    aboveSurfaceMeters: Math.max(
      maximumBladeHeightMeters,
      profile.clover?.enabled ? profile.clover.heightOffsetMeters : 0,
    ),
  };
}

export function requireGrassRuntimeLayer(
  layer: VegetationRuntimeLayer,
): GrassRuntimeLayer {
  if (layer.config.renderProfile.type !== 'grass') {
    throw new Error(
      `Runtime layer "${layer.key}" uses render profile "${layer.config.renderProfile.type}", not "grass".`,
    );
  }
  const data = layer.preparedProfileData as Partial<GrassLayerPreparedData> | undefined;
  if (!data?.patterns || !data.activeCells) {
    throw new Error(`Runtime grass layer "${layer.key}" has incomplete prepared data.`);
  }
  return layer as GrassRuntimeLayer;
}

/** Built-in preparation owned by the Grass profile, including Worker transfers. */
export const grassLayerPreparation = {
  profileType: 'grass',
  validateConfig: validateGrassRuntimeLayerConfig,
  prepare(
    file: ParsedVegFile,
    fileLayer: ParsedVegLayer,
    storedChunkGridCoordinates: Uint32Array,
    config: VegetationRuntimeLayerConfig,
  ): PreparedVegetationLayerProfile<GrassLayerPreparedData> {
    const grassConfig = requireGrassRuntimeLayerConfig(config);
    const cullingBounds = calculateGrassLayerCullingBounds(grassConfig);
    return {
      cullingBounds,
      preparedProfileData: prepareGrassLayerData(
        file,
        fileLayer,
        storedChunkGridCoordinates,
        grassConfig,
      ),
    };
  },
  collectTransferBuffers(data: unknown, buffers: Set<ArrayBuffer>): void {
    const grassData = data as GrassLayerPreparedData;
    addArrayBuffer(buffers, grassData.patterns.anchorPositions.buffer);
    addArrayBuffer(buffers, grassData.activeCells.indices.buffer);
    addArrayBuffer(buffers, grassData.activeCells.offsets.buffer);
    addArrayBuffer(buffers, grassData.activeCells.counts.buffer);
    const patchBuffer = grassData.groundPatchField?.data.buffer;
    if (patchBuffer) addArrayBuffer(buffers, patchBuffer);
  },
} as const;

function addArrayBuffer(buffers: Set<ArrayBuffer>, buffer: ArrayBufferLike): void {
  if (buffer instanceof ArrayBuffer) buffers.add(buffer);
}
