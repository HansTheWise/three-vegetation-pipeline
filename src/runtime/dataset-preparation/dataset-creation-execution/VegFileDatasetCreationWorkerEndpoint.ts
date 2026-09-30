import {
  collectVegetationLayerTransferBuffers,
  createVegetationLayerPreparationRegistry,
  type VegetationLayerPreparation,
} from '../layer-profile-preparation/VegetationLayerPreparation.js';
import { VegFileDatasetCreationManager } from '../VegFileDatasetCreationManager.js';
import type {
  VegFileDatasetCreationWorkerRequest,
  VegFileDatasetCreationWorkerResponse,
} from '../VegFileDatasetCreationContracts.js';

export type VegFileDatasetCreationWorkerScope = {
  onmessage: ((event: MessageEvent<VegFileDatasetCreationWorkerRequest>) => void) | null;
  postMessage(
    message: VegFileDatasetCreationWorkerResponse,
    transfer: Transferable[],
  ): void;
};

/** Installs the dataset-creation protocol in a bundler-owned Worker entry. */
export function installVegFileDatasetCreationWorkerEndpoint(
  workerScope: VegFileDatasetCreationWorkerScope,
  options: Readonly<{
    layerPreparations?: readonly VegetationLayerPreparation[];
  }> = {},
): void {
  const preparationRegistry = createVegetationLayerPreparationRegistry(
    options.layerPreparations,
  );
  const vegFileDatasetCreationManager = new VegFileDatasetCreationManager(
    [...preparationRegistry.values()],
  );
  workerScope.onmessage = (event) => {
    try {
      const response = vegFileDatasetCreationManager.createVegetationDataset(
        event.data.vegFileBytes,
        event.data.vegetationRuntimeConfig,
      );
      workerScope.postMessage(response, collectTransferBuffers(response, preparationRegistry));
    } catch (error) {
      workerScope.postMessage({
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error ? { errorName: error.name } : {}),
      } satisfies VegFileDatasetCreationWorkerResponse, []);
    }
  };
}

function collectTransferBuffers(
  datasetCreationResult: Exclude<
    VegFileDatasetCreationWorkerResponse,
    Readonly<{ error: string }>
  >,
  preparationRegistry: ReturnType<typeof createVegetationLayerPreparationRegistry>,
): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  addArrayBuffer(buffers, datasetCreationResult.dataset.file.bytes.buffer);
  addArrayBuffer(
    buffers,
    datasetCreationResult.dataset.storedChunkGridCoordinateLookup.buffer,
  );
  for (const layer of datasetCreationResult.dataset.preparedLayers) {
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
