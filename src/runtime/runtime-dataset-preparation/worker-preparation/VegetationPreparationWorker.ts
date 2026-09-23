import {
  collectVegetationLayerTransferBuffers,
  createVegetationLayerPreparationRegistry,
  type VegetationLayerPreparation,
} from '../layer-profile-preparation/VegetationLayerPreparation.js';
import { prepareVegetationRuntimeData } from './prepareVegetationRuntimeData.js';
import type {
  VegetationPreparationWorkerRequest,
  VegetationPreparationWorkerResponse,
} from './VegetationPreparationTypes.js';

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
      const response = prepareVegetationRuntimeData(
        event.data.source,
        event.data.config,
        [...preparationRegistry.values()],
      );
      workerScope.postMessage(response, collectTransferBuffers(response, preparationRegistry));
    } catch (error) {
      workerScope.postMessage({
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error ? { errorName: error.name } : {}),
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
  addArrayBuffer(buffers, prepared.dataset.storedChunkGridCoordinates.buffer);
  for (const layer of prepared.dataset.preparedLayers) {
    collectVegetationLayerTransferBuffers(
      preparationRegistry,
      layer.config.renderProfile.type,
      layer.preparedProfileData,
      buffers,
    );
  }
  return [...buffers];
}

function addArrayBuffer(buffers: Set<ArrayBuffer>, buffer: ArrayBufferLike): void {
  if (buffer instanceof ArrayBuffer) buffers.add(buffer);
}
