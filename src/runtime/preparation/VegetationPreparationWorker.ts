import { createVegetationRuntimeDataset } from '../dataset/createVegetationRuntimeDataset.js';
import { createVegetationActiveCellData } from '../density/VegetationRenderTileDensity.js';
import { parseVegFile } from '../parser/VegParser.js';
import { collectBuiltInVegetationLayerTransferBuffers } from '../profiles/VegetationLayerPreparation.js';
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
): void {
  workerScope.onmessage = (event) => {
    try {
      const start = performance.now();
      const dataset = createVegetationRuntimeDataset(
        parseVegFile(event.data.source),
        event.data.config,
      );
      const activeCells = dataset.enabledLayers.map((layer) => (
        createVegetationActiveCellData(dataset, layer.layerId)
      ));
      const response = {
        dataset,
        activeCells,
        preparationMilliseconds: performance.now() - start,
      } satisfies VegetationPreparationWorkerResponse;
      workerScope.postMessage(response, collectTransferBuffers(response));
    } catch (error) {
      workerScope.postMessage({
        error: error instanceof Error ? error.message : String(error),
      } satisfies VegetationPreparationWorkerResponse, []);
    }
  };
}

function collectTransferBuffers(
  prepared: Exclude<VegetationPreparationWorkerResponse, Readonly<{ error: string }>>,
): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  addArrayBuffer(buffers, prepared.dataset.file.bytes.buffer);
  for (const cells of prepared.activeCells) {
    addArrayBuffer(buffers, cells.indices.buffer);
    addArrayBuffer(buffers, cells.offsets.buffer);
    addArrayBuffer(buffers, cells.counts.buffer);
  }
  for (const layer of prepared.dataset.layers) {
    addArrayBuffer(buffers, layer.patterns.anchorPositions.buffer);
    collectBuiltInVegetationLayerTransferBuffers(
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
