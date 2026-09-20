import type {
  Axis,
  SurfaceSelector,
  VegetationExtractionConfig,
  VegetationLayerConfig,
} from '../../offline-compilation-orchestration/VegetationCompilerConfig.js';
import type { ModelPrimitive } from '../../three-glb-model-reading/ModelInputTypes.js';
import {
  calculateTriangleSlopeDegrees,
  type ExtractionTriangle,
  type HeightSurfacePoint,
} from './ExtractionGeometry.js';

export type LayerTriangleSelection = Readonly<{
  config: VegetationLayerConfig;
  vegetationTriangles: ExtractionTriangle[];
  exclusionTriangles: ExtractionTriangle[];
}>;

export type SelectedExtractionTriangles = Readonly<{
  heightSurfaceTriangles: ExtractionTriangle[];
  layerTriangleSelections: readonly LayerTriangleSelection[];
}>;

type ExtractionAxes = Readonly<{
  firstHorizontalAxis: Axis;
  secondHorizontalAxis: Axis;
  heightAxis: Axis;
}>;

export function selectModelTrianglesForExtraction(
  modelPrimitives: readonly ModelPrimitive[],
  config: VegetationExtractionConfig,
): SelectedExtractionTriangles {
  const extractionAxes = createExtractionAxes(config.coordinateSystem);
  const heightSurfaceTriangles: ExtractionTriangle[] = [];
  const layerTriangleSelections: LayerTriangleSelection[] = (
    config.extraction.vegetationLayers.map((layerConfig) => ({
      config: layerConfig,
      vegetationTriangles: [],
      exclusionTriangles: [],
    }))
  );

  for (const primitive of modelPrimitives) {
    const isHeightSurface = matchesSurfaceSelector(
      primitive,
      config.source.heightSurfaceSelector,
    );
    const matchingLayerSelections = layerTriangleSelections.filter(({ config: layer }) => (
      matchesSurfaceSelector(primitive, layer.surfaceSelector)
    ));
    const excludingLayerSelections = layerTriangleSelections.filter(({ config: layer }) => (
      layer.exclusionSurfaceSelector
      && matchesSurfaceSelector(primitive, layer.exclusionSurfaceSelector)
    ));
    if (
      !isHeightSurface
      && matchingLayerSelections.length === 0
      && excludingLayerSelections.length === 0
    ) {
      continue;
    }

    for (
      let triangleIndexOffset = 0;
      triangleIndexOffset < primitive.triangleVertexIndices.length;
      triangleIndexOffset += 3
    ) {
      const triangle = readExtractionTriangle(
        primitive,
        triangleIndexOffset,
        extractionAxes,
      );
      if (isHeightSurface) heightSurfaceTriangles.push(triangle);
      for (const layerSelection of matchingLayerSelections) {
        if (
          calculateTriangleSlopeDegrees(triangle)
          <= layerSelection.config.filters.maximumSlopeDegrees
        ) {
          layerSelection.vegetationTriangles.push(triangle);
        }
      }
      for (const layerSelection of excludingLayerSelections) {
        layerSelection.exclusionTriangles.push(triangle);
      }
    }
  }

  return { heightSurfaceTriangles, layerTriangleSelections };
}

function createExtractionAxes(
  coordinateSystem: VegetationExtractionConfig['coordinateSystem'],
): ExtractionAxes {
  return {
    firstHorizontalAxis: coordinateSystem.horizontalAxes[0],
    secondHorizontalAxis: coordinateSystem.horizontalAxes[1],
    heightAxis: coordinateSystem.upAxis,
  };
}

function readExtractionTriangle(
  primitive: ModelPrimitive,
  triangleIndexOffset: number,
  extractionAxes: ExtractionAxes,
): ExtractionTriangle {
  return {
    firstVertex: readHeightSurfacePoint(
      primitive,
      primitive.triangleVertexIndices[triangleIndexOffset],
      extractionAxes,
    ),
    secondVertex: readHeightSurfacePoint(
      primitive,
      primitive.triangleVertexIndices[triangleIndexOffset + 1],
      extractionAxes,
    ),
    thirdVertex: readHeightSurfacePoint(
      primitive,
      primitive.triangleVertexIndices[triangleIndexOffset + 2],
      extractionAxes,
    ),
  };
}

function readHeightSurfacePoint(
  primitive: ModelPrimitive,
  vertexIndex: number | undefined,
  extractionAxes: ExtractionAxes,
): HeightSurfacePoint {
  if (vertexIndex === undefined) throw new Error('Incomplete triangle index data.');
  const positionOffset = vertexIndex * 3;
  const modelX = primitive.modelLocalVertexPositions[positionOffset];
  const modelY = primitive.modelLocalVertexPositions[positionOffset + 1];
  const modelZ = primitive.modelLocalVertexPositions[positionOffset + 2];
  if (modelX === undefined || modelY === undefined || modelZ === undefined) {
    throw new Error(`Triangle index ${vertexIndex} exceeds the position data.`);
  }
  const modelPosition = { x: modelX, y: modelY, z: modelZ };
  return {
    horizontalX: modelPosition[extractionAxes.firstHorizontalAxis],
    horizontalY: modelPosition[extractionAxes.secondHorizontalAxis],
    height: modelPosition[extractionAxes.heightAxis],
  };
}

function matchesSurfaceSelector(
  primitive: ModelPrimitive,
  surfaceSelector: SurfaceSelector,
): boolean {
  const nameSelectors = 'all' in surfaceSelector
    ? surfaceSelector.all
    : surfaceSelector.any;
  const matchesNameSelector = (
    nameSelector: (typeof nameSelectors)[number],
  ): boolean => {
    const candidateNames = nameSelector.type === 'material-name'
      ? [primitive.materialName]
      : primitive.hierarchyNodeNames;
    const normalizeName = nameSelector.caseSensitive
      ? (value: string): string => value
      : (value: string): string => value.toLocaleLowerCase('en-US');
    const expectedNamesOrPrefixes = nameSelector.values.map(normalizeName);
    return candidateNames.some((candidateName) => {
      const normalizedCandidateName = normalizeName(candidateName);
      return nameSelector.type === 'hierarchy-node-name-prefix'
        ? expectedNamesOrPrefixes.some(
          (prefix) => normalizedCandidateName.startsWith(prefix),
        )
        : expectedNamesOrPrefixes.includes(normalizedCandidateName);
    });
  };
  return 'all' in surfaceSelector
    ? nameSelectors.every(matchesNameSelector)
    : nameSelectors.some(matchesNameSelector);
}
