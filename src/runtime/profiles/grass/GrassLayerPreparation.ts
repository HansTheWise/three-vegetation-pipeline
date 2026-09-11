import type {
  GrassRuntimeLayerConfig,
  VegetationRuntimeLayerConfig,
} from '../../config/types.js';
import { validateGrassRuntimeLayerConfig } from '../../config/validateVegetationRuntimeConfig.js';
import { createVegetationActiveCellDataForLayer } from '../../density/VegetationRenderTileDensity.js';
import type { VegetationActiveCellData } from '../../density/types.js';
import type { VegetationRuntimeLayer } from '../../dataset/types.js';
import type { ParsedVegFile } from '../../parser/types.js';
import { createVegetationPatterns } from '../../patterns/VegetationPatterns.js';
import type { VegetationPatternSet } from '../../patterns/types.js';
import {
  createGrassGroundPatchField,
} from './patches/createGrassGroundPatchField.js';
import type { GrassGroundPatchField } from './patches/types.js';
import { requireGrassRuntimeLayerConfig } from './GrassRenderProfile.js';

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
  layerId: number,
  config: GrassRuntimeLayerConfig,
): GrassLayerPreparedData {
  const fileLayer = file.layers.find((layer) => layer.id === layerId);
  if (!fileLayer) throw new Error(`VEGFILE layer ${layerId} does not exist.`);
  return {
    patterns: createVegetationPatterns(
      file.header.seed,
      { ...config.pattern, anchorsPerCell: config.distribution.anchorsPerCell },
    ),
    activeCells: createVegetationActiveCellDataForLayer(
      file,
      fileLayer,
      layerId,
      config.density.renderTileSizeCells,
    ),
    groundPatchField: config.enabled
      ? createGrassGroundPatchField(file, layerId, config.patches.ground)
      : undefined,
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
  const data = layer.profileData as Partial<GrassLayerPreparedData> | undefined;
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
    layerId: number,
    config: VegetationRuntimeLayerConfig,
  ): GrassLayerPreparedData {
    return prepareGrassLayerData(
      file,
      layerId,
      requireGrassRuntimeLayerConfig(config),
    );
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
