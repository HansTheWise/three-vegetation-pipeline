import type {
  VegetationExtractionConfig,
  VegetationLayerConfig,
} from '../offline-compilation-orchestration/VegetationCompilerConfig.js';
import type { ModelData } from '../three-glb-model-reading/ModelInputTypes.js';
import {
  concatenateChunkHeightMaps,
  extractChunkHeightMap,
} from './chunk-heightmap-extraction/ChunkHeightMapExtraction.js';
import {
  binTrianglesByChunk,
  createExtractionChunkGrid,
  type TriangleChunkBins,
} from './extraction-grid-construction/ExtractionChunkGrid.js';
import { selectModelTrianglesForExtraction } from './model-triangle-selection/ModelTriangleSelection.js';
import type {
  VegetationDataset,
  VegetationExtractorOptions,
} from './VegetationExtractionTypes.js';
import {
  assertLayerMasksDoNotOverlap,
  concatenateStoredLayerMasks,
  countActiveMaskCells,
  hasActiveMaskCell,
  rasterizeVegetationMask,
  removeExcludedCellsFromMask,
} from './vegetation-mask-extraction/VegetationMaskExtraction.js';

const UINT32_MAX = 0xffff_ffff;

type LayerExtractionState = {
  readonly config: VegetationLayerConfig;
  readonly vegetationTriangleBins: TriangleChunkBins;
  readonly exclusionTriangleBins: TriangleChunkBins;
  activeCellCount: number;
};

/** Converts neutral model data into file-format-independent vegetation data. */
export function extractVegetation(
  model: ModelData,
  config: VegetationExtractionConfig,
  options: VegetationExtractorOptions = {},
): VegetationDataset {
  validateConfig(config);
  if (!model.modelLocalBounds) {
    throw new Error('Cannot extract vegetation from an empty model.');
  }

  const configuredLayers = config.extraction.vegetationLayers;
  if (configuredLayers.length === 0) {
    throw new Error('No vegetation layers configured.');
  }

  const {
    heightSurfaceTriangles,
    layerTriangleSelections,
  } = selectModelTrianglesForExtraction(
    model.primitives,
    config,
  );
  if (heightSurfaceTriangles.length === 0) {
    throw new Error('Height surface selector did not match any triangles.');
  }

  const chunkGrid = createExtractionChunkGrid(
    heightSurfaceTriangles,
    config.extraction.grid.chunkSize,
  );
  const logicalChunkCount = chunkGrid.width * chunkGrid.height;
  if (!Number.isSafeInteger(logicalChunkCount)) {
    throw new Error('Chunk grid size exceeds the JavaScript safe integer range.');
  }

  const heightSurfaceTriangleBins = binTrianglesByChunk(
    heightSurfaceTriangles,
    chunkGrid,
  );
  const layerExtractionStates: LayerExtractionState[] = layerTriangleSelections.map(
    (selection) => ({
      config: selection.config,
      vegetationTriangleBins: binTrianglesByChunk(
        selection.vegetationTriangles,
        chunkGrid,
      ),
      exclusionTriangleBins: binTrianglesByChunk(
        selection.exclusionTriangles,
        chunkGrid,
      ),
      activeCellCount: 0,
    }),
  );

  const chunkLookup = new Int32Array(logicalChunkCount).fill(-1);
  const storedChunkHeightRanges: VegetationDataset['storedChunkHeightRanges'][number][] = [];
  const storedChunkHeightMaps: Float64Array[] = [];
  const storedChunkLayerMasks: Uint8Array[][] = [];

  for (
    let logicalChunkIndex = 0;
    logicalChunkIndex < logicalChunkCount;
    logicalChunkIndex += 1
  ) {
    const chunkGridX = logicalChunkIndex % chunkGrid.width;
    const chunkGridY = Math.floor(logicalChunkIndex / chunkGrid.width);
    const chunkOriginX = chunkGrid.originX + chunkGridX * chunkGrid.chunkSize;
    const chunkOriginY = chunkGrid.originY + chunkGridY * chunkGrid.chunkSize;
    const layerMasks = extractChunkLayerMasks(
      layerExtractionStates,
      logicalChunkIndex,
      chunkOriginX,
      chunkOriginY,
      chunkGrid.chunkSize,
    );
    assertLayerMasksDoNotOverlap(
      layerMasks,
      configuredLayers,
      config.extraction.vegetationMask.allowLayerOverlap,
      chunkGridX,
      chunkGridY,
    );
    if (!layerMasks.some(hasActiveMaskCell)) continue;

    const chunkHeightSurfaceTriangles = heightSurfaceTriangleBins[logicalChunkIndex] ?? [];
    if (chunkHeightSurfaceTriangles.length === 0) {
      throw new Error(
        `Stored chunk (${chunkGridX}, ${chunkGridY}) has no height triangles.`,
      );
    }
    const chunkHeightMap = extractChunkHeightMap(
      chunkHeightSurfaceTriangles,
      chunkOriginX,
      chunkOriginY,
      chunkGrid.chunkSize,
      config.extraction.heightMap.resolution,
    );
    const storedChunkIndex = storedChunkHeightRanges.length;
    chunkLookup[logicalChunkIndex] = storedChunkIndex;
    storedChunkHeightRanges.push({
      minimumHeight: chunkHeightMap.minimumHeight,
      maximumHeight: chunkHeightMap.maximumHeight,
    });
    storedChunkHeightMaps.push(chunkHeightMap.sampleHeights);
    storedChunkLayerMasks.push(layerMasks);
  }

  for (const layerState of layerExtractionStates) {
    if (layerState.activeCellCount === 0) {
      throw new Error(`Vegetation layer "${layerState.config.key}" is empty.`);
    }
  }

  return {
    sourceBounds: model.modelLocalBounds,
    coordinateSystem: {
      upAxis: config.coordinateSystem.upAxis,
      horizontalAxes: config.coordinateSystem.horizontalAxes,
      unitsPerMeter: config.coordinateSystem.unitsPerMeter,
    },
    seed: resolveSeed(config, options.generateSeed),
    grid: chunkGrid,
    heightMap: {
      resolution: config.extraction.heightMap.resolution,
    },
    layers: layerExtractionStates.map((layerState, layerIndex) => ({
      id: layerState.config.id,
      key: layerState.config.key,
      maskResolution: layerState.config.maskResolution,
      maskData: concatenateStoredLayerMasks(
        storedChunkLayerMasks,
        layerIndex,
        layerState.config.maskResolution ** 2,
      ),
    })),
    chunkLookup,
    storedChunkHeightRanges,
    heightData: concatenateChunkHeightMaps(storedChunkHeightMaps),
  };
}

function extractChunkLayerMasks(
  layerStates: readonly LayerExtractionState[],
  logicalChunkIndex: number,
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
): Uint8Array[] {
  return layerStates.map((layerState) => {
    const vegetationMask = rasterizeVegetationMask(
      layerState.vegetationTriangleBins[logicalChunkIndex] ?? [],
      chunkOriginX,
      chunkOriginY,
      chunkSize,
      layerState.config.maskResolution,
    );
    removeExcludedCellsFromMask(
      vegetationMask,
      layerState.exclusionTriangleBins[logicalChunkIndex] ?? [],
      chunkOriginX,
      chunkOriginY,
      chunkSize,
      layerState.config.maskResolution,
    );
    layerState.activeCellCount += countActiveMaskCells(vegetationMask);
    return vegetationMask;
  });
}

function resolveSeed(
  config: VegetationExtractionConfig,
  generateSeed: (() => number) | undefined,
): number {
  if (config.extraction.seed.mode === 'manual') {
    return config.extraction.seed.manualValue >>> 0;
  }
  const seed = (generateSeed ?? randomUint32)();
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new Error('Generated seed must be an unsigned 32-bit integer.');
  }
  return seed >>> 0;
}

function randomUint32(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0]!;
}

function validateConfig(config: VegetationExtractionConfig): void {
  const axes = [config.coordinateSystem.upAxis, ...config.coordinateSystem.horizontalAxes];
  if (new Set(axes).size !== 3) throw new Error('Coordinate axes must be unique.');
  if (
    !Number.isFinite(config.coordinateSystem.unitsPerMeter)
    || config.coordinateSystem.unitsPerMeter <= 0
  ) {
    throw new Error('unitsPerMeter must be greater than zero.');
  }
  if (
    !Number.isFinite(config.extraction.grid.chunkSize)
    || config.extraction.grid.chunkSize <= 0
  ) {
    throw new Error('chunkSize must be greater than zero.');
  }
  validateResolution('heightMap.resolution', config.extraction.heightMap.resolution, 2);
  const layers = config.extraction.vegetationLayers;
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length) {
    throw new Error('Vegetation layer IDs must be unique.');
  }
  if (new Set(layers.map((layer) => layer.key)).size !== layers.length) {
    throw new Error('Vegetation layer keys must be unique.');
  }
  for (const layer of layers) validateLayer(layer);
  if (config.extraction.seed.mode === 'manual') {
    const seed = config.extraction.seed.manualValue;
    if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
      throw new Error('manualValue must be an unsigned 32-bit integer.');
    }
  }
}

function validateLayer(layer: VegetationLayerConfig): void {
  if (!Number.isInteger(layer.id) || layer.id < 0 || layer.id > UINT32_MAX) {
    throw new Error('Vegetation layer ID must be an unsigned 32-bit integer.');
  }
  if (!layer.key) throw new Error('Vegetation layer key must not be empty.');
  validateResolution(`maskResolution for "${layer.key}"`, layer.maskResolution, 1);
  if (
    !Number.isFinite(layer.filters.maximumSlopeDegrees)
    || layer.filters.maximumSlopeDegrees < 0
    || layer.filters.maximumSlopeDegrees > 90
  ) {
    throw new Error(
      `maximumSlopeDegrees for "${layer.key}" must be between 0 and 90.`,
    );
  }
}

function validateResolution(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > 4096) {
    throw new Error(`${name} must be an integer between ${minimum} and 4096.`);
  }
}
