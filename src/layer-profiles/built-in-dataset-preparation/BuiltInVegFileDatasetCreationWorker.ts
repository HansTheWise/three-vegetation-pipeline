import type { VegFileDatasetCreationWorkerFactory } from '../../runtime/dataset-preparation/dataset-creation-execution/WorkerVegFileDatasetCreationAdapter.js';

/** Shared Worker factory for the built-in runtime-profile preparation registry. */
export const createBuiltInVegFileDatasetCreationWorker:
  VegFileDatasetCreationWorkerFactory = () => new Worker(
    new URL('./BuiltInVegFileDatasetCreation.worker.js', import.meta.url),
    { type: 'module' },
  );
