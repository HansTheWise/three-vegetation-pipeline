import type {
  VegetationDatasetCreationResult,
  VegetationRuntimeSource,
  VegFileDatasetCreationAdapter,
} from './dataset-preparation/VegFileDatasetCreationContracts.js';
import type { VegetationRuntimeConfig } from './dataset-preparation/configuration/VegetationRuntimeConfig.js';
import {
  WorkerVegFileDatasetCreationAdapter,
  type VegFileDatasetCreationWorkerFactory,
} from './dataset-preparation/dataset-creation-execution/WorkerVegFileDatasetCreationAdapter.js';
import type { WebGLVegetationLayerRendererFactory } from './vegetation-layer-management/WebGLVegetationLayerManager.js';

/** Complete project-facing contract for one vegetation runtime profile. */
export interface VegetationRuntimeProfile
  extends WebGLVegetationLayerRendererFactory {
  readonly datasetCreationWorkerFactory: VegFileDatasetCreationWorkerFactory;
}

/** Immutable profile registry and Worker-backed preparation boundary. */
export class VegetationPipelineSetup implements VegFileDatasetCreationAdapter {
  readonly runtimeProfiles: readonly VegetationRuntimeProfile[];
  readonly #datasetCreationAdapter: WorkerVegFileDatasetCreationAdapter;

  private constructor(
    runtimeProfiles: readonly VegetationRuntimeProfile[],
    datasetCreationWorkerFactory: VegFileDatasetCreationWorkerFactory,
  ) {
    this.runtimeProfiles = runtimeProfiles;
    this.#datasetCreationAdapter = new WorkerVegFileDatasetCreationAdapter(
      datasetCreationWorkerFactory,
    );
  }

  static create(
    options: CreateVegetationPipelineSetupOptions,
  ): VegetationPipelineSetup {
    const datasetCreationWorkerFactory = validateRuntimeProfiles(
      options.runtimeProfiles,
    );
    return new VegetationPipelineSetup(
      [...options.runtimeProfiles],
      datasetCreationWorkerFactory,
    );
  }

  createVegetationDataset(
    vegFileBytes: VegetationRuntimeSource,
    vegetationRuntimeConfig: VegetationRuntimeConfig,
    cancellationSignal?: AbortSignal,
  ): Promise<VegetationDatasetCreationResult> {
    return this.#datasetCreationAdapter.createVegetationDataset(
      vegFileBytes,
      vegetationRuntimeConfig,
      cancellationSignal,
    );
  }
}

/** Validates and binds the selected runtime profiles to one dataset Worker. */
export function createVegetationPipelineSetup(
  options: CreateVegetationPipelineSetupOptions,
): VegetationPipelineSetup {
  return VegetationPipelineSetup.create(options);
}

function validateRuntimeProfiles(
  runtimeProfiles: readonly VegetationRuntimeProfile[],
): VegFileDatasetCreationWorkerFactory {
  if (runtimeProfiles.length === 0) {
    throw new Error('Vegetation pipeline setup requires at least one runtime profile.');
  }

  const profileTypes = new Set<string>();
  const datasetCreationWorkerFactory =
    runtimeProfiles[0]!.datasetCreationWorkerFactory;
  for (const runtimeProfile of runtimeProfiles) {
    if (runtimeProfile.profileType.length === 0) {
      throw new Error('Vegetation runtime profileType must not be empty.');
    }
    if (profileTypes.has(runtimeProfile.profileType)) {
      throw new Error(
        `Duplicate vegetation runtime profile for profile "${runtimeProfile.profileType}".`,
      );
    }
    profileTypes.add(runtimeProfile.profileType);
    if (runtimeProfile.datasetCreationWorkerFactory !== datasetCreationWorkerFactory) {
      throw new Error(
        'Vegetation runtime profiles must share one dataset-creation Worker factory.',
      );
    }
  }

  return datasetCreationWorkerFactory;
}

export type CreateVegetationPipelineSetupOptions = Readonly<{
  runtimeProfiles: readonly VegetationRuntimeProfile[];
}>;
