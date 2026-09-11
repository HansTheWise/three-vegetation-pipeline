import { createVegetationRuntimeDataset } from '../dataset/createVegetationRuntimeDataset.js';
import { parseVegFile } from '../parser/VegParser.js';
import {
  collectVegetationLayerTransferBuffers,
  createVegetationLayerPreparationRegistry,
  type VegetationLayerPreparation,
} from '../profiles/VegetationLayerPreparation.js';
import type {
  VegetationPreparationWorkerRequest,
  VegetationPreparationWorkerResponse,
} from './types.js';

export type VegetationPreparationWorkerScope = {
  onmessage: ((event: MessageEvent<VegetationPreparationWorkerRequest>) => void) | null;
  postMessage(
    message: VegetationPreparationWorkerResponse,
    transfer: Transferable[],
  ): void;
};

/** Installs the pipeline-owned preparation protocol in a bundler-owned Worker entry. */
export function installVegetationPreparationWorker(
  workerScope: VegetationPreparationWorkerScope,
  options: Readonly<{
    layerPreparations?: readonly VegetationLayerPreparation[];
  }> = {},
): void {
  const preparationRegistry = createVegetationLayerPreparationRegistry(
    options.layerPreparations,
  );
  workerScope.onmessage = (event) => {
    try {
      const start = performance.now();
      const dataset = createVegetationRuntimeDataset(
        parseVegFile(event.data.source),
        event.data.config,
        [...preparationRegistry.values()],
      );
      const response = {
        dataset,
        preparationMilliseconds: performance.now() - start,
      } satisfies VegetationPreparationWorkerResponse;
      workerScope.postMessage(response, collectTransferBuffers(response, preparationRegistry));
    } catch (error) {
      workerScope.postMessage({
        error: error instanceof Error ? error.message : String(error),
      } satisfies VegetationPreparationWorkerResponse, []);
    }
  };
}

function collectTransferBuffers(
  prepared: Exclude<VegetationPreparationWorkerResponse, Readonly<{ error: string }>>,
  preparationRegistry: ReturnType<typeof createVegetationLayerPreparationRegistry>,
): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  addArrayBuffer(buffers, prepared.dataset.file.bytes.buffer);
  for (const layer of prepared.dataset.layers) {
    collectVegetationLayerTransferBuffers(
      preparationRegistry,
      layer.config.renderProfile.type,
      layer.profileData,
      buffers,
    );
  }
  return [...buffers];
}

function addArrayBuffer(buffers: Set<ArrayBuffer>, buffer: ArrayBufferLike): void {
  if (buffer instanceof ArrayBuffer) buffers.add(buffer);
}
