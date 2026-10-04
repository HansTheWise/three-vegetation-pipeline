import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WorkerVegFileDatasetCreationAdapter,
  isUnsupportedVegFileVersionError,
  installVegFileDatasetCreationWorkerEndpoint,
  grassLayerPreparation,
  requireGrassRuntimeLayer,
  writeVegFile,
  type VegetationDatasetCreationResult,
  type GrassRuntimeLayerConfig,
  type VegetationLayerPreparation,
  type VegFileDatasetCreationWorkerRequest,
  type VegFileDatasetCreationWorkerScope,
  type VegetationRuntimeConfig,
  type VegetationDataset,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';
import { vegetationRuntimeConfig } from './fixtures/vegetationRuntimeConfig.js';

class TestWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WorkerVegFileDatasetCreationAdapter', () => {
  it('transfers a source copy and terminates after a successful response', async () => {
    const worker = new TestWorker();
    const datasetCreationAdapter = new WorkerVegFileDatasetCreationAdapter(
      () => worker as unknown as Worker,
    );
    const source = Uint8Array.of(1, 2, 3);
    const promise = datasetCreationAdapter.createVegetationDataset(
      source,
      vegetationRuntimeConfig,
    );
    const [request, transfer] = worker.postMessage.mock.calls[0]! as [
      VegFileDatasetCreationWorkerRequest,
      ArrayBuffer[],
    ];
    expect(request.vegFileBytes).toEqual(source);
    expect(request.vegFileBytes).not.toBe(source);
    expect(request.vegetationRuntimeConfig).toBe(vegetationRuntimeConfig);
    expect(transfer).toEqual([request.vegFileBytes.buffer]);
    expect(source).toEqual(Uint8Array.of(1, 2, 3));

    const result = {
      dataset: { preparedLayers: [] },
      datasetCreationMilliseconds: 4,
    } as unknown as VegetationDatasetCreationResult;
    worker.onmessage!({ data: result } as MessageEvent);
    expect(await promise).toBe(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('creates transferable runtime data in the Worker endpoint', async () => {
    const postMessage = vi.fn();
    const scope: VegFileDatasetCreationWorkerScope = {
      onmessage: null,
      postMessage,
    };
    installVegFileDatasetCreationWorkerEndpoint(scope, {
      layerPreparations: [grassLayerPreparation],
    });
    const source = createVegetationFileBytes();

    scope.onmessage!({
      data: { vegFileBytes: source, vegetationRuntimeConfig },
    } as unknown as MessageEvent<VegFileDatasetCreationWorkerRequest>);

    const [response, transfer] = postMessage.mock.calls[0]! as [
      VegetationDatasetCreationResult,
      ArrayBuffer[],
    ];
    expect(response).not.toHaveProperty('error');
    expect(response.dataset.preparedLayers).toHaveLength(1);
    const grassData = requireGrassRuntimeLayer(
      response.dataset.preparedLayers[0]!,
    ).preparedProfileData;
    expect(grassData.activeCells.indices).toHaveLength(4);
    expect(transfer).toContain(response.dataset.file.bytes.buffer);
    expect(transfer).toContain(response.dataset.storedChunkGridCoordinateLookup.buffer);
    expect(transfer).toContain(grassData.activeCells.indices.buffer);
    const received = structuredClone(response, { transfer });
    expect(received.dataset.file.bytes.byteLength).toBeGreaterThan(0);
    expect(requireGrassRuntimeLayer(
      received.dataset.preparedLayers[0]!,
    ).preparedProfileData.activeCells.indices).toHaveLength(4);
  });

  it('registers Grass preparation in the built-in profile Worker entry', async () => {
    const postMessage = vi.fn();
    const scope: VegFileDatasetCreationWorkerScope = {
      onmessage: null,
      postMessage,
    };
    vi.stubGlobal('self', scope);
    await import(
      '../src/layer-profiles/built-in-dataset-preparation/BuiltInVegFileDatasetCreation.worker.js'
    );

    scope.onmessage!({
      data: {
        vegFileBytes: createVegetationFileBytes(),
        vegetationRuntimeConfig,
      },
    } as unknown as MessageEvent<VegFileDatasetCreationWorkerRequest>);

    const [response, transfer] = postMessage.mock.calls[0]! as [
      VegetationDatasetCreationResult,
      ArrayBuffer[],
    ];
    const grassData = requireGrassRuntimeLayer(
      response.dataset.preparedLayers[0]!,
    ).preparedProfileData;
    expect(transfer).toContain(grassData.activeCells.indices.buffer);
    expect(grassData.activeCells.indices).toHaveLength(4);
  });

  it('lets a custom profile own worker preparation and transferable buffers', () => {
    const postMessage = vi.fn();
    const scope: VegFileDatasetCreationWorkerScope = { onmessage: null, postMessage };
    const preparation: VegetationLayerPreparation = {
      profileType: 'test-tree',
      createPreparedVegetationLayerProfile: () => ({
        cullingBounds: {
          horizontalPaddingMeters: 2,
          belowSurfaceMeters: 0,
          aboveSurfaceMeters: 10,
        },
        preparedProfileData: { branches: Uint32Array.of(2, 4, 8) },
      }),
      collectTransferBuffers(data, buffers) {
        const buffer = (data as { branches: Uint32Array }).branches.buffer;
        if (buffer instanceof ArrayBuffer) buffers.add(buffer);
      },
    };
    const config = {
      configVersion: 3,
      layers: [{
        vegetationLayerId: 0,
        vegetationLayerKey: 'trees',
        enabled: true,
        renderProfile: { type: 'test-tree' },
      }],
    } satisfies VegetationRuntimeConfig;
    installVegFileDatasetCreationWorkerEndpoint(scope, {
      layerPreparations: [preparation],
    });

    scope.onmessage!({
      data: {
        vegFileBytes: createVegetationFileBytes(),
        vegetationRuntimeConfig: config,
      },
    } as unknown as MessageEvent<VegFileDatasetCreationWorkerRequest>);

    const [response, transfer] = postMessage.mock.calls[0]! as [
      VegetationDatasetCreationResult,
      ArrayBuffer[],
    ];
    const branches = response.dataset.preparedLayers[0]!.preparedProfileData as {
      branches: Uint32Array;
    };
    expect([...branches.branches]).toEqual([2, 4, 8]);
    expect(transfer).toContain(branches.branches.buffer);
  });

  it('terminates and rejects an in-flight request when canceled', async () => {
    const worker = new TestWorker();
    const cancellationController = new AbortController();
    const promise = new WorkerVegFileDatasetCreationAdapter(
      () => worker as unknown as Worker,
    ).createVegetationDataset(
      new Uint8Array(),
      vegetationRuntimeConfig,
      cancellationController.signal,
    );

    cancellationController.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('forwards worker-reported and native worker failures', async () => {
    const reportedWorker = new TestWorker();
    const reported = new WorkerVegFileDatasetCreationAdapter(
      () => reportedWorker as unknown as Worker,
    ).createVegetationDataset(
      new Uint8Array(),
      vegetationRuntimeConfig,
      new AbortController().signal,
    );
    reportedWorker.onmessage!({
      data: {
        error: 'Unsupported .veg file version 1; expected version 2.',
        errorName: 'UnsupportedVegFileVersionError',
      },
    } as MessageEvent);
    await expect(reported).rejects.toSatisfy(isUnsupportedVegFileVersionError);

    const nativeWorker = new TestWorker();
    const native = new WorkerVegFileDatasetCreationAdapter(
      () => nativeWorker as unknown as Worker,
    ).createVegetationDataset(
      new Uint8Array(),
      vegetationRuntimeConfig,
      new AbortController().signal,
    );
    nativeWorker.onerror!({ message: 'worker crashed' } as ErrorEvent);
    await expect(native).rejects.toThrow(
      'VEGFILE dataset creation Worker failed: worker crashed',
    );
    expect(reportedWorker.terminate).toHaveBeenCalledOnce();
    expect(nativeWorker.terminate).toHaveBeenCalledOnce();
  });
});

function createVegetationFileBytes(): Uint8Array {
  const dataset: VegetationDataset = {
    sourceBounds: {
      minX: -0.5, minY: 0, minZ: -0.5,
      maxX: 0.5, maxY: 0, maxZ: 0.5,
    },
    coordinateSystem: {
      upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1,
    },
    vegetationSeed: 42,
    grid: { width: 1, height: 1, chunkSize: 1, originX: -0.5, originY: -0.5 },
    heightMap: { resolutionPerChunkAxis: 2 },
    chunkLookup: Int32Array.of(0),
    storedChunkHeightRanges: [{ minimumHeight: 0, maximumHeight: 0 }],
    heightData: Float64Array.of(0, 0, 0, 0),
    layers: [{
      vegetationLayerId: 0,
      vegetationLayerKey: 'meadow-grass',
      maskResolutionPerChunkAxis: 2,
      maskData: Uint8Array.of(1, 1, 1, 1),
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}
