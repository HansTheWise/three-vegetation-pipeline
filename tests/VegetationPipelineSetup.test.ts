import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createVegetationPipelineSetup,
  createWebGLGrassRuntimeProfile,
  type VegetationRuntimeProfile,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';

class TestWorker {
  static constructorArguments: unknown[][] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor(...arguments_: unknown[]) {
    TestWorker.constructorArguments.push(arguments_);
  }
}

afterEach(() => {
  TestWorker.constructorArguments = [];
  vi.unstubAllGlobals();
});

describe('createVegetationPipelineSetup', () => {
  it('creates the built-in Grass dataset Worker only when preparation starts', () => {
    vi.stubGlobal('Worker', TestWorker);
    const grassRuntimeProfile = createWebGLGrassRuntimeProfile();

    const pipelineSetup = createVegetationPipelineSetup({
      runtimeProfiles: [grassRuntimeProfile],
    });

    expect(pipelineSetup.runtimeProfiles).toEqual([grassRuntimeProfile]);
    expect(TestWorker.constructorArguments).toHaveLength(0);

    void pipelineSetup.createVegetationDataset(
      new Uint8Array(),
      { configVersion: 3, layers: [] },
    );

    expect(TestWorker.constructorArguments).toHaveLength(1);
    expect(TestWorker.constructorArguments[0]![0]).toBeInstanceOf(URL);
    expect(TestWorker.constructorArguments[0]![1]).toEqual({ type: 'module' });
  });

  it('rejects duplicate runtime profile types', () => {
    const grassRuntimeProfile = createWebGLGrassRuntimeProfile();

    expect(() => createVegetationPipelineSetup({
      runtimeProfiles: [grassRuntimeProfile, grassRuntimeProfile],
    })).toThrow('Duplicate vegetation runtime profile for profile "grass".');
  });

  it('rejects an empty runtime profile type', () => {
    const grassRuntimeProfile = createWebGLGrassRuntimeProfile();

    expect(() => createVegetationPipelineSetup({
      runtimeProfiles: [{ ...grassRuntimeProfile, profileType: '' }],
    })).toThrow('Vegetation runtime profileType must not be empty.');
  });

  it('rejects profiles that cannot be prepared by one Worker', () => {
    const firstWorkerFactory = () => ({}) as Worker;
    const secondWorkerFactory = () => ({}) as Worker;
    const createProfile = (
      profileType: string,
      datasetCreationWorkerFactory: () => Worker,
    ): VegetationRuntimeProfile => ({
      profileType,
      datasetCreationWorkerFactory,
      create: vi.fn(),
    });

    expect(() => createVegetationPipelineSetup({
      runtimeProfiles: [
        createProfile('first', firstWorkerFactory),
        createProfile('second', secondWorkerFactory),
      ],
    })).toThrow('Vegetation runtime profiles must share one dataset-creation Worker factory.');
  });

  it('rejects a setup without runtime profiles', () => {
    expect(() => createVegetationPipelineSetup({
      runtimeProfiles: [],
    })).toThrow('Vegetation pipeline setup requires at least one runtime profile.');
  });
});
