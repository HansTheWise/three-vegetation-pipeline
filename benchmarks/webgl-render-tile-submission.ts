import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

import {
  createThreeVegetationSceneBinding,
  createWebGLGrassLayerModule,
  grassPreset,
  WorkerVegFileDatasetCreationAdapter,
  writeVegFile,
  type ThreeVegetationSceneBinding,
  type VegetationDataset,
  type VegetationDensityCurvePoint,
  type VegetationRuntimeConfig,
} from '../src/package-entrypoints/InternalDevelopmentApi.js';
import {
  grassLayerPreparation,
  requireGrassRuntimeLayer,
} from '../src/layer-profiles/grass/grass-layer-preparation/GrassLayerPreparation.js';
import { WebGLGrassLayerRenderer } from '../src/layer-profiles/grass/grass-webgl-rendering/WebGLGrassLayerRenderer.js';
import { createThreeWebGLGrassLightingMaterialFactory } from '../src/runtime/project-integration/layer-profile-integration/grass/lighting-material/ThreeWebGLGrassLightingMaterialFactory.js';
import type { WebGLVegetationLayerModule } from '../src/runtime/vegetation-layer-management/WebGLVegetationLayerManager.js';

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;
const WARMUP_FRAME_COUNT = 60;
const MEASURED_FRAME_COUNT = 120;

type BenchmarkStrategy = Readonly<{
  name: string;
  layerModules: readonly WebGLVegetationLayerModule[];
}>;

type BenchmarkResult = Readonly<{
  scenario: string;
  strategy: string;
  drawCalls: number;
  visibleTileCount: number;
  visibleCandidateCount: number;
  submittedCandidateCount: number;
  paddingPercentage: number;
  cpuUpdateMedianMilliseconds: number;
  cpuRenderMedianMilliseconds: number;
  gpuMedianMilliseconds: number | undefined;
  gpuP95Milliseconds: number | undefined;
}>;

type DisjointTimerQueryExtension = Readonly<{
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}>;

const statusElement = requireElement('status');
const resultsElement = requireElement('results');
const errorElement = requireElement('error');
const canvasHost = requireElement('canvas-host');

const renderer = new WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false);
canvasHost.append(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#91b7ce');
scene.add(new AmbientLight('#ffffff', 0.7));
const sun = new DirectionalLight('#fff4df', 1.1);
sun.position.set(80, 160, 60);
scene.add(sun);

const camera = new PerspectiveCamera(52, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 600);
camera.position.set(0, 90, 150);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);

const source = createBenchmarkVegetationBytes();
const datasetCreationAdapter = new WorkerVegFileDatasetCreationAdapter(() => new Worker(
  new URL('./vegetationDatasetCreation.worker.ts', import.meta.url),
  { type: 'module' },
));
const fineBucketModule = createFineBucketGrassModule();
const strategies: readonly BenchmarkStrategy[] = [
  { name: 'Current power-of-two buckets', layerModules: [createWebGLGrassLayerModule()] },
  { name: '25% capacity-step buckets', layerModules: [fineBucketModule] },
];
const scenarios = [
  { name: '4 m Render Tiles', renderTileSizeCells: 16 },
  { name: '8 m Render Tiles', renderTileSizeCells: 32 },
] as const;

void runBenchmark().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  statusElement.textContent = 'Benchmark failed.';
  errorElement.textContent = message;
  console.error(error);
});

window.addEventListener('pagehide', () => renderer.dispose(), { once: true });

async function runBenchmark(): Promise<void> {
  const results: BenchmarkResult[] = [];
  for (const scenario of scenarios) {
    for (const strategy of strategies) {
      statusElement.textContent = `Running ${scenario.name}: ${strategy.name}…`;
      await nextAnimationFrame();
      const result = await measureStrategy(
        scenario.name,
        scenario.renderTileSizeCells,
        strategy,
      );
      results.push(result);
      appendResult(result);
    }
    verifyScenarioCandidateCounts(results.filter((result) => result.scenario === scenario.name));
  }
  statusElement.textContent = 'Benchmark complete.';
}

async function measureStrategy(
  scenario: string,
  renderTileSizeCells: number,
  strategy: BenchmarkStrategy,
): Promise<BenchmarkResult> {
  const vegetation = await createThreeVegetationSceneBinding({
    renderer,
    scene,
    camera,
    vegFileBytes: source,
    vegetationRuntimeConfig: createBenchmarkConfig(renderTileSizeCells),
    datasetCreationAdapter,
    layerModules: strategy.layerModules,
  });
  try {
    for (let frameIndex = 0; frameIndex < WARMUP_FRAME_COUNT; frameIndex += 1) {
      vegetation.updateFrame();
      renderer.render(scene, camera);
      await nextAnimationFrame();
    }

    const gpuTimer = new WebGLGpuTimer(renderer.getContext());
    const cpuUpdateMilliseconds: number[] = [];
    const cpuRenderMilliseconds: number[] = [];
    const drawCalls: number[] = [];
    for (let frameIndex = 0; frameIndex < MEASURED_FRAME_COUNT; frameIndex += 1) {
      renderer.info.reset();
      // Enclose both resource uploads and rendering in the GPU query.
      const query = gpuTimer.begin();
      const updateStartedAt = performance.now();
      vegetation.updateFrame();
      cpuUpdateMilliseconds.push(performance.now() - updateStartedAt);

      const renderStartedAt = performance.now();
      renderer.render(scene, camera);
      cpuRenderMilliseconds.push(performance.now() - renderStartedAt);
      gpuTimer.end(query);
      drawCalls.push(renderer.info.render.calls);
      await nextAnimationFrame();
    }

    const gpuMilliseconds = await gpuTimer.resolve();
    const diagnostics = requireGrassDiagnostics(vegetation);
    return {
      scenario,
      strategy: strategy.name,
      drawCalls: Math.round(median(drawCalls)),
      visibleTileCount: diagnostics.visibleTileCount,
      visibleCandidateCount: diagnostics.visibleCandidateCount,
      submittedCandidateCount: diagnostics.executedCandidateCount,
      paddingPercentage: diagnostics.executedCandidateCount === 0
        ? 0
        : (diagnostics.executedCandidateCount - diagnostics.visibleCandidateCount)
          / diagnostics.executedCandidateCount * 100,
      cpuUpdateMedianMilliseconds: median(cpuUpdateMilliseconds),
      cpuRenderMedianMilliseconds: median(cpuRenderMilliseconds),
      gpuMedianMilliseconds: gpuMilliseconds ? median(gpuMilliseconds) : undefined,
      gpuP95Milliseconds: gpuMilliseconds ? percentile(gpuMilliseconds, 0.95) : undefined,
    };
  } finally {
    vegetation.destroy();
    renderer.render(scene, camera);
  }
}

function createFineBucketGrassModule(): WebGLVegetationLayerModule {
  const grassLightingMaterialFactory = createThreeWebGLGrassLightingMaterialFactory();
  return {
    ...grassLayerPreparation,
    validateLayer: (layer) => requireGrassRuntimeLayer(layer),
    create(context) {
      const layer = requireGrassRuntimeLayer(context.layer);
      const renderTileSizeCells = Math.min(
        layer.config.density.renderTileSizeCells,
        layer.fileLayer.maskResolutionPerChunkAxis,
      );
      const maximumCandidatesPerTile = renderTileSizeCells ** 2
        * layer.config.distribution.anchorsPerCell
        * layer.config.distribution.elementsPerAnchor;
      return new WebGLGrassLayerRenderer({
        renderer: context.renderer,
        vegetationDataset: context.vegetationDataset,
        vegetationDatasetTextures: context.vegetationDatasetTextures,
        visibleStoredChunkTexture: context.visibleStoredChunkTexture,
        layer,
        grassLightingMaterialFactory,
        candidateCapacityBuckets: createQuarterStepCapacities(maximumCandidatesPerTile),
      });
    },
  };
}

function createQuarterStepCapacities(maximumCandidateCount: number): Uint32Array {
  const capacities = [1];
  while (capacities[capacities.length - 1]! < maximumCandidateCount) {
    const previousCapacity = capacities[capacities.length - 1]!;
    capacities.push(Math.min(
      maximumCandidateCount,
      Math.max(previousCapacity + 1, Math.ceil(previousCapacity * 1.25)),
    ));
  }
  return Uint32Array.from(capacities);
}

function createBenchmarkConfig(renderTileSizeCells: number): VegetationRuntimeConfig {
  const densityCurve = [
    { distanceMeters: 0, ratio: 1 },
    { distanceMeters: 40, ratio: 1 },
    { distanceMeters: 120, ratio: 0.55 },
    { distanceMeters: 220, ratio: 0.2 },
    { distanceMeters: 280, ratio: 0 },
  ] as const satisfies readonly VegetationDensityCurvePoint[];
  return {
    configVersion: 3,
    layers: [grassPreset({
      vegetationLayerId: 0,
      vegetationLayerKey: 'benchmark-grass',
      distribution: { anchorsPerCell: 4, elementsPerAnchor: 1 },
      visibility: { maximumDistanceMeters: 280 },
      density: {
        renderTileSizeCells,
        activeCells: densityCurve,
        activeAnchors: densityCurve,
        activeElements: densityCurve,
      },
      shadows: { cast: false, receive: false },
    })],
  };
}

function createBenchmarkVegetationBytes(): Uint8Array {
  const gridWidth = 8;
  const gridHeight = 8;
  const chunkSize = 32;
  const maskResolutionPerChunkAxis = 128;
  const storedChunkCount = gridWidth * gridHeight;
  const cellsPerChunk = maskResolutionPerChunkAxis ** 2;
  const dataset: VegetationDataset = {
    sourceBounds: {
      minX: -128, minY: 0, minZ: -128,
      maxX: 128, maxY: 0, maxZ: 128,
    },
    coordinateSystem: {
      upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1,
    },
    vegetationSeed: 42,
    grid: {
      width: gridWidth,
      height: gridHeight,
      chunkSize,
      originX: -128,
      originY: -128,
    },
    heightMap: { resolutionPerChunkAxis: 2 },
    chunkLookup: Int32Array.from(
      { length: storedChunkCount },
      (_, storedChunkIndex) => storedChunkIndex,
    ),
    storedChunkHeightRanges: Array.from(
      { length: storedChunkCount },
      () => ({ minimumHeight: 0, maximumHeight: 0 }),
    ),
    heightData: new Float64Array(storedChunkCount * 4),
    layers: [{
      vegetationLayerId: 0,
      vegetationLayerKey: 'benchmark-grass',
      maskResolutionPerChunkAxis,
      maskData: new Uint8Array(storedChunkCount * cellsPerChunk).fill(1),
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}

function requireGrassDiagnostics(vegetation: ThreeVegetationSceneBinding) {
  const diagnostics = vegetation.diagnostics.layers[0];
  if (!diagnostics) throw new Error('Grass benchmark layer diagnostics are missing.');
  return diagnostics;
}

function verifyScenarioCandidateCounts(results: readonly BenchmarkResult[]): void {
  if (results.length !== strategies.length) {
    throw new Error('A benchmark scenario did not produce every strategy result.');
  }
  const expectedTileCount = results[0]!.visibleTileCount;
  const expectedCandidateCount = results[0]!.visibleCandidateCount;
  for (const result of results.slice(1)) {
    if (result.visibleTileCount !== expectedTileCount
      || result.visibleCandidateCount !== expectedCandidateCount) {
      throw new Error(
        `${result.scenario} strategies did not render identical visible Tile budgets.`,
      );
    }
  }
}

function appendResult(result: BenchmarkResult): void {
  const row = document.createElement('tr');
  for (const value of [
    result.scenario,
    result.strategy,
    result.drawCalls.toLocaleString('en-US'),
    result.visibleTileCount.toLocaleString('en-US'),
    result.visibleCandidateCount.toLocaleString('en-US'),
    result.submittedCandidateCount.toLocaleString('en-US'),
    `${result.paddingPercentage.toFixed(1)}%`,
    formatMilliseconds(result.cpuUpdateMedianMilliseconds),
    formatMilliseconds(result.cpuRenderMedianMilliseconds),
    formatOptionalMilliseconds(result.gpuMedianMilliseconds),
    formatOptionalMilliseconds(result.gpuP95Milliseconds),
  ]) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  resultsElement.append(row);
}

class WebGLGpuTimer {
  readonly #context: WebGL2RenderingContext;
  readonly #extension: DisjointTimerQueryExtension | null;
  readonly #queries: WebGLQuery[] = [];

  constructor(context: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!(context instanceof WebGL2RenderingContext)) {
      throw new Error('The WebGL benchmark requires WebGL 2.');
    }
    this.#context = context;
    this.#extension = context.getExtension(
      'EXT_disjoint_timer_query_webgl2',
    ) as DisjointTimerQueryExtension | null;
  }

  begin(): WebGLQuery | undefined {
    if (!this.#extension) return undefined;
    const query = this.#context.createQuery();
    if (!query) throw new Error('WebGL could not allocate a GPU timer query.');
    this.#context.beginQuery(this.#extension.TIME_ELAPSED_EXT, query);
    return query;
  }

  end(query: WebGLQuery | undefined): void {
    if (!query || !this.#extension) return;
    this.#context.endQuery(this.#extension.TIME_ELAPSED_EXT);
    this.#queries.push(query);
  }

  async resolve(): Promise<number[] | undefined> {
    if (!this.#extension) return undefined;
    const pendingQueries = [...this.#queries];
    const gpuMilliseconds: number[] = [];
    const deadline = performance.now() + 10_000;
    while (pendingQueries.length > 0) {
      if (this.#context.getParameter(this.#extension.GPU_DISJOINT_EXT) === true) {
        pendingQueries.forEach((query) => this.#context.deleteQuery(query));
        return undefined;
      }
      for (let index = pendingQueries.length - 1; index >= 0; index -= 1) {
        const query = pendingQueries[index]!;
        if (this.#context.getQueryParameter(query, this.#context.QUERY_RESULT_AVAILABLE)) {
          const elapsedNanoseconds = Number(
            this.#context.getQueryParameter(query, this.#context.QUERY_RESULT),
          );
          gpuMilliseconds.push(elapsedNanoseconds / 1_000_000);
          this.#context.deleteQuery(query);
          pendingQueries.splice(index, 1);
        }
      }
      if (pendingQueries.length === 0) break;
      if (performance.now() >= deadline) {
        pendingQueries.forEach((query) => this.#context.deleteQuery(query));
        return undefined;
      }
      await nextAnimationFrame();
    }
    return gpuMilliseconds;
  }
}

function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) throw new Error('Cannot calculate a percentile without samples.');
  const sortedValues = [...values].sort((left, right) => left - right);
  return sortedValues[Math.min(
    sortedValues.length - 1,
    Math.floor((sortedValues.length - 1) * ratio),
  )]!;
}

function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toFixed(3)} ms`;
}

function formatOptionalMilliseconds(milliseconds: number | undefined): string {
  return milliseconds === undefined ? 'unavailable' : formatMilliseconds(milliseconds);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Benchmark element #${id} is missing.`);
  return element;
}
