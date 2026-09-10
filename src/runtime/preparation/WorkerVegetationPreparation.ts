import type { VegetationRuntimeConfig } from '../config/types.js';
import { throwIfVegetationPreparationAborted } from './SynchronousVegetationPreparation.js';
import type {
  PreparedVegetationRuntime,
  VegetationPreparationAdapter,
  VegetationPreparationWorkerRequest,
  VegetationPreparationWorkerResponse,
  VegetationRuntimeSource,
} from './types.js';

export type VegetationPreparationWorkerFactory = () => Worker;

/** Runs parsing and static Cell admission in a short-lived module Worker. */
export class WorkerVegetationPreparation implements VegetationPreparationAdapter {
  readonly #createWorker: VegetationPreparationWorkerFactory;

  constructor(createWorker: VegetationPreparationWorkerFactory) {
    this.#createWorker = createWorker;
  }

  prepare(
    source: VegetationRuntimeSource,
    config: VegetationRuntimeConfig,
    signal: AbortSignal,
  ): Promise<PreparedVegetationRuntime> {
    throwIfVegetationPreparationAborted(signal);
    return new Promise((resolve, reject) => {
      const worker = this.#createWorker();
      let settled = false;
      const finish = (): boolean => {
        if (settled) return false;
        settled = true;
        signal.removeEventListener('abort', abort);
        worker.terminate();
        return true;
      };
      const abort = () => {
        if (!finish()) return;
        const error = new Error('Vegetation preparation aborted.');
        error.name = 'AbortError';
        reject(error);
      };
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = (event: MessageEvent<VegetationPreparationWorkerResponse>) => {
        if (!finish()) return;
        if ('error' in event.data) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      worker.onerror = (event) => {
        if (!finish()) return;
        reject(new Error(`Vegetation preparation Worker failed: ${event.message}`));
      };

      const workerSource = source instanceof Uint8Array
        ? source.slice()
        : new Uint8Array(source).slice();
      const request: VegetationPreparationWorkerRequest = { source: workerSource, config };
      try {
        worker.postMessage(request, [workerSource.buffer]);
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }
}
