import type { VegetationRuntimeConfig } from '../configuration/VegetationRuntimeConfig.js';
import type {
  VegetationDatasetCreationResult,
  VegFileDatasetCreationAdapter,
  VegFileDatasetCreationWorkerRequest,
  VegFileDatasetCreationWorkerResponse,
  VegetationRuntimeSource,
} from '../VegFileDatasetCreationContracts.js';

export type VegFileDatasetCreationWorkerFactory = () => Worker;

/** Creates the renderer-independent vegetation dataset in a short-lived module Worker. */
export class WorkerVegFileDatasetCreationAdapter implements VegFileDatasetCreationAdapter {
  readonly #createWorker: VegFileDatasetCreationWorkerFactory;

  constructor(createWorker: VegFileDatasetCreationWorkerFactory) {
    this.#createWorker = createWorker;
  }

  createVegetationDataset(
    vegFileBytes: VegetationRuntimeSource,
    vegetationRuntimeConfig: VegetationRuntimeConfig,
    cancellationSignal?: AbortSignal,
  ): Promise<VegetationDatasetCreationResult> {
    cancellationSignal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const worker = this.#createWorker();
      let settled = false;
      const finish = (): boolean => {
        if (settled) return false;
        settled = true;
        cancellationSignal?.removeEventListener('abort', cancel);
        worker.terminate();
        return true;
      };
      const cancel = () => {
        if (!finish()) return;
        const error = new Error('VEGFILE dataset creation canceled.');
        error.name = 'AbortError';
        reject(error);
      };
      cancellationSignal?.addEventListener('abort', cancel, { once: true });
      worker.onmessage = (event: MessageEvent<VegFileDatasetCreationWorkerResponse>) => {
        if (!finish()) return;
        if ('error' in event.data) {
          const error = new Error(event.data.error);
          if (event.data.errorName) error.name = event.data.errorName;
          reject(error);
        } else resolve(event.data);
      };
      worker.onerror = (event) => {
        if (!finish()) return;
        reject(new Error(`VEGFILE dataset creation Worker failed: ${event.message}`));
      };

      const workerVegFileBytes = vegFileBytes instanceof Uint8Array
        ? vegFileBytes.slice()
        : new Uint8Array(vegFileBytes).slice();
      const request: VegFileDatasetCreationWorkerRequest = {
        vegFileBytes: workerVegFileBytes,
        vegetationRuntimeConfig,
      };
      try {
        worker.postMessage(request, [workerVegFileBytes.buffer]);
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }
}
