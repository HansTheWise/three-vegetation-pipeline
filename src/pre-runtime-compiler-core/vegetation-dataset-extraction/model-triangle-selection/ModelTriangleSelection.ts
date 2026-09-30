import type {
  ModelSurfaceSelection,
  ResolvedVegetationExtractionConfig,
  VegetationLayerExtractionConfig,
} from '../../configuration/VegetationCompilerConfig.js';
import type { ModelAxis } from '../../../shared/vegfile-format/VegetationFileTypes.js';
import type { ModelPrimitive } from '../../glb-model-reading/ModelInputTypes.js';
import {
  calculateTriangleSlopeDegrees,
  type ExtractionTriangle,
  type HeightSurfacePoint,
} from './ExtractionGeometry.js';

export type LayerTriangleSelection = Readonly<{
  config: VegetationLayerExtractionConfig;
  vegetationTriangles: ExtractionTriangle[];
  exclusionTriangles: ExtractionTriangle[];
}>;

export type SelectedExtractionTriangles = Readonly<{
  heightSurfaceTriangles: ExtractionTriangle[];
  layerTriangleSelections: readonly LayerTriangleSelection[];
}>;

type ExtractionAxes = Readonly<{
  firstHorizontalAxis: ModelAxis;
  secondHorizontalAxis: ModelAxis;
  heightAxis: ModelAxis;
}>;

export function selectModelTrianglesForExtraction(
  modelPrimitives: readonly ModelPrimitive[],
  config: ResolvedVegetationExtractionConfig,
): SelectedExtractionTriangles {
  const extractionAxes = createExtractionAxes(config.coordinateSystem);
  const heightSurfaceTriangles: ExtractionTriangle[] = [];
  const layerTriangleSelections: LayerTriangleSelection[] = (
    config.vegetationLayers.map((layerConfig) => ({
      config: layerConfig,
      vegetationTriangles: [],
      exclusionTriangles: [],
    }))
  );

  for (const primitive of modelPrimitives) {
    const isHeightMapSourceSurface = matchesModelSurfaceSelection(
      primitive,
      config.heightMap.sourceSurfaceSelection,
    );
    const matchingLayerSelections = layerTriangleSelections.filter(({ config: layer }) => (
      matchesModelSurfaceSelection(primitive, layer.includedSurfaceSelection)
    ));
    const excludingLayerSelections = layerTriangleSelections.filter(({ config: layer }) => (
      layer.excludedSurfaceSelection
      && matchesModelSurfaceSelection(primitive, layer.excludedSurfaceSelection)
    ));
    if (
      !isHeightMapSourceSurface
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
      if (isHeightMapSourceSurface) heightSurfaceTriangles.push(triangle);
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
  coordinateSystem: ResolvedVegetationExtractionConfig['coordinateSystem'],
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

function matchesModelSurfaceSelection(
  primitive: ModelPrimitive,
  surfaceSelection: ModelSurfaceSelection,
): boolean {
  const nameRules = 'matchAll' in surfaceSelection
    ? surfaceSelection.matchAll
    : surfaceSelection.matchAny;
  const matchesNameRule = (
    nameRule: (typeof nameRules)[number],
  ): boolean => {
    const candidateNames = nameRule.property === 'materialName'
      ? [primitive.materialName]
      : primitive.hierarchyNodeNames;
    const normalizeName = nameRule.caseSensitive
      ? (value: string): string => value
      : (value: string): string => value.toLocaleLowerCase('en-US');
    const expectedNamesOrPrefixes = nameRule.property === 'hierarchyNodeNamePrefix'
      ? nameRule.acceptedPrefixes.map(normalizeName)
      : nameRule.acceptedNames.map(normalizeName);
    return candidateNames.some((candidateName) => {
      const normalizedCandidateName = normalizeName(candidateName);
      return nameRule.property === 'hierarchyNodeNamePrefix'
        ? expectedNamesOrPrefixes.some(
          (prefix) => normalizedCandidateName.startsWith(prefix),
        )
        : expectedNamesOrPrefixes.includes(normalizedCandidateName);
    });
  };
  return 'matchAll' in surfaceSelection
    ? nameRules.every(matchesNameRule)
    : nameRules.some(matchesNameRule);
}
