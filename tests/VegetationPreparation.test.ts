import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SynchronousVegetationPreparation,
  WorkerVegetationPreparation,
  installVegetationPreparationWorker,
  writeVegFile,
  type PreparedVegetationRuntime,
  type VegetationPreparationWorkerRequest,
  type VegetationPreparationWorkerScope,
  type VegetationDataset,
} from '../src/index.js';
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

describe('SynchronousVegetationPreparation', () => {
  it('stops before parsing when the request is already aborted', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => new SynchronousVegetationPreparation().prepare(
      new Uint8Array(),
      vegetationRuntimeConfig,
      controller.signal,
    )).toThrow(expect.objectContaining({ name: 'AbortError' }));
  });
});

describe('WorkerVegetationPreparation', () => {
  it('transfers a source copy and terminates after a successful response', async () => {
    const worker = new TestWorker();
    const preparation = new WorkerVegetationPreparation(() => worker as unknown as Worker);
    const source = Uint8Array.of(1, 2, 3);
    const promise = preparation.prepare(
      source,
      vegetationRuntimeConfig,
      new AbortController().signal,
    );
    const [request, transfer] = worker.postMessage.mock.calls[0]! as [
      VegetationPreparationWorkerRequest,
      ArrayBuffer[],
    ];
    expect(request.source).toEqual(source);
    expect(request.source).not.toBe(source);
    expect(transfer).toEqual([request.source.buffer]);
    expect(source).toEqual(Uint8Array.of(1, 2, 3));

    const result = {
      dataset: { layers: [], enabledLayers: [] },
      activeCells: [],
      preparationMilliseconds: 4,
    } as unknown as PreparedVegetationRuntime;
    worker.onmessage!({ data: result } as MessageEvent);
    expect(await promise).toBe(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('prepares transferable runtime data in the bundled worker entry', async () => {
    const postMessage = vi.fn();
    const scope: VegetationPreparationWorkerScope = {
      onmessage: null,
      postMessage,
    };
    installVegetationPreparationWorker(scope);
    const source = createVegetationFileBytes();

    scope.onmessage!({
      data: { source, config: vegetationRuntimeConfig },
    } as unknown as MessageEvent<VegetationPreparationWorkerRequest>);

    const [response, transfer] = postMessage.mock.calls[0]! as [
      PreparedVegetationRuntime,
      ArrayBuffer[],
    ];
    expect(response).not.toHaveProperty('error');
    expect(response.dataset.enabledLayers).toHaveLength(1);
    expect(response.activeCells[0]!.indices).toHaveLength(4);
    expect(transfer).toContain(response.dataset.file.bytes.buffer);
    expect(transfer).toContain(response.activeCells[0]!.indices.buffer);
    const received = structuredClone(response, { transfer });
    expect(received.dataset.file.bytes.byteLength).toBeGreaterThan(0);
    expect(received.activeCells[0]!.indices).toHaveLength(4);
  });

  it('terminates and rejects an in-flight request when aborted', async () => {
    const worker = new TestWorker();
    const controller = new AbortController();
    const promise = new WorkerVegetationPreparation(
      () => worker as unknown as Worker,
    ).prepare(new Uint8Array(), vegetationRuntimeConfig, controller.signal);

    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('forwards worker-reported and native worker failures', async () => {
    const reportedWorker = new TestWorker();
    const reported = new WorkerVegetationPreparation(
      () => reportedWorker as unknown as Worker,
    ).prepare(new Uint8Array(), vegetationRuntimeConfig, new AbortController().signal);
    reportedWorker.onmessage!({ data: { error: 'Invalid VEGFILE' } } as MessageEvent);
    await expect(reported).rejects.toThrow('Invalid VEGFILE');

    const nativeWorker = new TestWorker();
    const native = new WorkerVegetationPreparation(
      () => nativeWorker as unknown as Worker,
    ).prepare(new Uint8Array(), vegetationRuntimeConfig, new AbortController().signal);
    nativeWorker.onerror!({ message: 'worker crashed' } as ErrorEvent);
    await expect(native).rejects.toThrow('Worker failed: worker crashed');
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
    seed: 42,
    grid: { width: 1, height: 1, chunkSize: 1, originX: -0.5, originY: -0.5 },
    heightMap: { resolution: 2 },
    chunkLookup: Int32Array.of(0),
    chunks: [{ gridX: 0, gridY: 0, minimumHeight: 0, maximumHeight: 0 }],
    heightData: Float64Array.of(0, 0, 0, 0),
    layers: [{
      id: 0,
      key: 'meadow-grass',
      displayName: 'Meadow grass',
      maskResolution: 2,
      activeCellCount: 4,
      maskData: Uint8Array.of(1, 1, 1, 1),
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}
