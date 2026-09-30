/// <reference lib="webworker" />

import {
  grassLayerPreparation,
  installVegFileDatasetCreationWorkerEndpoint,
  type VegFileDatasetCreationWorkerScope,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

installVegFileDatasetCreationWorkerEndpoint(
  self as unknown as VegFileDatasetCreationWorkerScope,
  { layerPreparations: [grassLayerPreparation] },
);
