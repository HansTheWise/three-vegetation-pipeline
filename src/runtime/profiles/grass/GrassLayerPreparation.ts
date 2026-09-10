import type {
  GrassRuntimeLayerConfig,
  VegetationRuntimeLayerConfig,
} from '../../config/types.js';
import type { VegetationRuntimeLayer } from '../../dataset/types.js';
import type { ParsedVegFile } from '../../parser/types.js';
import {
  createGrassGroundPatchField,
} from './patches/createGrassGroundPatchField.js';
import type { GrassGroundPatchField } from './patches/types.js';
import { requireGrassRuntimeLayerConfig } from './GrassRenderProfile.js';

export type GrassLayerPreparedData = Readonly<{
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
  return {
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
  return layer as GrassRuntimeLayer;
}

/** Built-in preparation owned by the Grass profile, including Worker transfers. */
export const grassLayerPreparation = {
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
    const buffer = grassData.groundPatchField?.data.buffer;
    if (buffer instanceof ArrayBuffer) buffers.add(buffer);
  },
} as const;
