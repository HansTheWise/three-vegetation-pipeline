/// <reference lib="webworker" />

import { grassLayerPreparation } from '../grass/grass-layer-preparation/GrassLayerPreparation.js';
import {
  installVegFileDatasetCreationWorkerEndpoint,
  type VegFileDatasetCreationWorkerScope,
} from '../../runtime/dataset-preparation/dataset-creation-execution/VegFileDatasetCreationWorkerEndpoint.js';

installVegFileDatasetCreationWorkerEndpoint(
  self as unknown as VegFileDatasetCreationWorkerScope,
  { layerPreparations: [grassLayerPreparation] },
);
