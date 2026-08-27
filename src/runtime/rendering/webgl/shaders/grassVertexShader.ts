import {
  ELEMENT_BOTTOM_COLOR_BITS,
  ELEMENT_HEIGHT_BITS,
  ELEMENT_OFFSET_ANGLE_BITS,
  ELEMENT_OFFSET_RADIUS_BITS,
  ELEMENT_ORIENTATION_BITS,
  ELEMENT_TILT_BITS,
  ELEMENT_TOP_COLOR_BITS,
  ELEMENT_WIDTH_BITS,
} from '../../../identity/ElementHashLayout.js';
import { LOD_CELL_COLUMN_HASH_SALT } from '../../../lod/VegetationRenderTileLod.js';
import { vegetationIdentityShader } from './vegetationIdentityShader.js';

export const grassVertexShader = /* glsl */ `
  precision highp float;
  precision highp int;

  in vec3 position;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform highp usampler2D visibleTileRecords;
  uniform highp usampler2D storedChunkGridCoordinates;
  uniform highp sampler2D chunkHeightRanges;
  uniform highp usampler2D heightData;
  uniform highp usampler2D layerMask;
  uniform highp sampler2D patternPositions;
  uniform highp sampler2D bottomColors;
  uniform highp sampler2D topColors;
  uniform uint seed;
  uniform uint layerId;
  uniform uint patternCount;
  uniform uint maskResolution;
  uniform uint renderTileSizeCells;
  uniform uint visibleCellCount;
  uniform uint visibleAnchorCount;
  uniform uint visibleElementCount;
  uniform uint cellPermutationStride;
  uniform int visibleTileTextureWidth;
  uniform bool finalLodLevel;
  uniform uint nextCellCount;
  uniform uint nextAnchorCount;
  uniform uint nextElementCount;
  uniform vec2 lodFadeRange;
  uniform uint bottomColorCount;
  uniform uint topColorCount;
  uniform bool rotatePerCell;
  uniform bool reflectPerCell;
  uniform vec2 gridOrigin;
  uniform float chunkSize;
  uniform int heightResolution;
  uniform float maximumQuantizedHeight;
  uniform float unitsPerMeter;
  uniform vec3 cameraPositionModel;
  uniform vec3 horizontalAxisA;
  uniform vec3 horizontalAxisB;
  uniform vec3 upAxis;
  uniform vec2 bladeHeight;
  uniform vec2 bladeWidth;
  uniform float bladeTopWidthRatio;
  uniform float maximumBladeTiltRadians;
  uniform float maximumBladeOffset;
  uniform float lodTransitionStartVisibleRatio;
  uniform bool useTwoSampleHeight;
  uniform vec2 bladeThicknessDistance;
  uniform vec2 bladeThicknessScale;
  uniform float bladeThicknessCurveStrength;

  flat out vec3 bladeBottomColor;
  flat out vec3 bladeTopColor;
  out vec3 modelNormal;
  out float bladeHeightRatio;
  out float cameraDistanceMeters;

  ${vegetationIdentityShader}

  uint readHashByte(uint hashValue, uint offset) {
    return (hashValue >> offset) & 0xffu;
  }

  float readHashRatio(uint hashValue, uint offset) {
    return float(readHashByte(hashValue, offset)) / 255.0;
  }

  float exponentialProgress(float distanceMeters, vec2 distanceRange, float strength) {
    float ratio = clamp(
      (distanceMeters - distanceRange.x) / (distanceRange.y - distanceRange.x),
      0.0,
      1.0
    );
    float exponentialEnd = exp(-strength);
    float density = (
      exp(-strength * ratio) - exponentialEnd
    ) / (1.0 - exponentialEnd);
    return 1.0 - density;
  }

  uvec3 readVisibleTile(uint visibleTileIndex) {
    uint textureWidth = uint(visibleTileTextureWidth);
    ivec2 coordinate = ivec2(
      int(visibleTileIndex % textureWidth),
      int(visibleTileIndex / textureWidth)
    );
    return texelFetch(visibleTileRecords, coordinate, 0).rgb;
  }

  float bladeGrowth(
    uint selectedCellIndex,
    uint anchorIndex,
    uint elementIndex,
    uint cellHashValue,
    uint anchorHashValue,
    uint elementHashValue,
    float distanceMeters
  ) {
    uint fadeHashValue = elementHashValue;
    if (!finalLodLevel) {
      if (selectedCellIndex >= nextCellCount) {
        fadeHashValue = cellHashValue;
      } else if (anchorIndex >= nextAnchorCount) {
        fadeHashValue = anchorHashValue;
      } else if (elementIndex >= nextElementCount) {
        fadeHashValue = elementHashValue;
      } else {
        return 1.0;
      }
    }
    float transitionProgress = smoothstep(
      lodFadeRange.x,
      lodFadeRange.y,
      distanceMeters
    );
    float fadeOrder = float(mixVegetationHash(
      fadeHashValue ^ 0xa511e9b3u
    )) / 4294967295.0;
    float fadeEnd = mix(0.15, 1.0, fadeOrder);
    return 1.0 - smoothstep(
      max(0.0, fadeEnd - 0.15),
      fadeEnd,
      transitionProgress
    );
  }

  uvec2 selectTileCell(uint selectedCellIndex, uint tileHashValue) {
    uint column = selectedCellIndex % renderTileSizeCells;
    uint pass = selectedCellIndex / renderTileSizeCells;
    uint x = (
      column * cellPermutationStride
      + tileHashValue % renderTileSizeCells
    ) % renderTileSizeCells;
    uint columnHash = mixVegetationHash(
      tileHashValue ^ ((column + 1u) * ${LOD_CELL_COLUMN_HASH_SALT}u)
    );
    uint y = (
      columnHash % renderTileSizeCells
      + pass * cellPermutationStride
      + (tileHashValue >> 16u) % renderTileSizeCells
    ) % renderTileSizeCells;
    return uvec2(x, y);
  }

  bool isActiveCell(uint storedChunkIndex, uvec2 localCell) {
    uint cellIndex = localCell.y * maskResolution + localCell.x;
    uint wordIndex = cellIndex / 32u;
    uint bitIndex = cellIndex - wordIndex * 32u;
    uint word = texelFetch(
      layerMask,
      ivec2(int(wordIndex), int(storedChunkIndex)),
      0
    ).r;
    return ((word >> bitIndex) & 1u) == 1u;
  }

  vec2 transformAnchor(vec2 anchor, uint cellHashValue) {
    if (reflectPerCell && cellIsReflected(cellHashValue)) {
      anchor.x = 1.0 - anchor.x;
    }
    uint quarterTurns = rotatePerCell
      ? cellRotationQuarterTurns(cellHashValue)
      : 0u;
    for (uint turn = 0u; turn < quarterTurns; turn += 1u) {
      anchor = vec2(1.0 - anchor.y, anchor.x);
    }
    return anchor;
  }

  float readDecodedHeight(
    uint storedChunkIndex,
    ivec2 coordinate,
    vec2 heightRange
  ) {
    int heightIndex = coordinate.y * heightResolution + coordinate.x;
    uint quantizedHeight = texelFetch(
      heightData,
      ivec2(heightIndex, int(storedChunkIndex)),
      0
    ).r;
    return mix(
      heightRange.x,
      heightRange.y,
      float(quantizedHeight) / maximumQuantizedHeight
    );
  }

  float interpolateHeight(
    uint storedChunkIndex,
    vec2 chunkUv,
    vec2 heightRange
  ) {
    vec2 samplePosition = clamp(chunkUv, 0.0, 1.0)
      * float(heightResolution - 1);
    ivec2 minimumCoordinate = ivec2(floor(samplePosition));
    ivec2 maximumCoordinate = min(
      minimumCoordinate + ivec2(1),
      ivec2(heightResolution - 1)
    );
    vec2 sampleRatio = fract(samplePosition);
    float lowerLeft = readDecodedHeight(
      storedChunkIndex,
      minimumCoordinate,
      heightRange
    );
    float lowerRight = readDecodedHeight(
      storedChunkIndex,
      ivec2(maximumCoordinate.x, minimumCoordinate.y),
      heightRange
    );
    float upperLeft = readDecodedHeight(
      storedChunkIndex,
      ivec2(minimumCoordinate.x, maximumCoordinate.y),
      heightRange
    );
    float upperRight = readDecodedHeight(
      storedChunkIndex,
      maximumCoordinate,
      heightRange
    );
    return mix(
      mix(lowerLeft, lowerRight, sampleRatio.x),
      mix(upperLeft, upperRight, sampleRatio.x),
      sampleRatio.y
    );
  }

  float averageDiagonalHeight(
    uint storedChunkIndex,
    vec2 chunkUv,
    vec2 heightRange
  ) {
    vec2 samplePosition = clamp(chunkUv, 0.0, 1.0)
      * float(heightResolution - 1);
    ivec2 minimumCoordinate = ivec2(floor(samplePosition));
    ivec2 maximumCoordinate = min(
      minimumCoordinate + ivec2(1),
      ivec2(heightResolution - 1)
    );
    float lowerLeft = readDecodedHeight(
      storedChunkIndex,
      minimumCoordinate,
      heightRange
    );
    float upperRight = readDecodedHeight(
      storedChunkIndex,
      maximumCoordinate,
      heightRange
    );
    return (lowerLeft + upperRight) * 0.5;
  }

  void hideInactiveBlade() {
    bladeBottomColor = vec3(0.0);
    bladeTopColor = vec3(0.0);
    modelNormal = upAxis;
    bladeHeightRatio = position.y;
    cameraDistanceMeters = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }

  void main() {
    uint elementsPerCell = visibleAnchorCount * visibleElementCount;
    uint elementsPerTile = visibleCellCount * elementsPerCell;
    uint instanceIndex = uint(gl_InstanceID);
    uint visibleTileIndex = instanceIndex / elementsPerTile;
    uint tileElementIndex = instanceIndex - visibleTileIndex * elementsPerTile;
    uint selectedCellIndex = tileElementIndex / elementsPerCell;
    uint cellElementIndex = tileElementIndex - selectedCellIndex * elementsPerCell;
    uint anchorIndex = cellElementIndex / visibleElementCount;
    uint elementIndex = cellElementIndex - anchorIndex * visibleElementCount;
    uvec3 visibleTile = readVisibleTile(visibleTileIndex);
    uint storedChunkIndex = visibleTile.x;
    uvec2 chunkGrid = texelFetch(
      storedChunkGridCoordinates,
      ivec2(int(storedChunkIndex), 0),
      0
    ).rg;
    uvec2 globalTileCell = chunkGrid * maskResolution
      + visibleTile.yz * renderTileSizeCells;
    uint tileHashValue = vegetationCellHash(seed, layerId, globalTileCell);
    uvec2 tileCell = selectTileCell(selectedCellIndex, tileHashValue);
    uvec2 localCell = visibleTile.yz * renderTileSizeCells + tileCell;
    if (any(greaterThanEqual(localCell, uvec2(maskResolution)))) {
      hideInactiveBlade();
      return;
    }
    if (!isActiveCell(storedChunkIndex, localCell)) {
      hideInactiveBlade();
      return;
    }

    uvec2 globalCell = chunkGrid * maskResolution + localCell;
    uint cellHashValue = vegetationCellHash(seed, layerId, globalCell);
    uint patternIndex = cellPatternValue(cellHashValue) % patternCount;
    vec2 normalizedAnchor = texelFetch(
      patternPositions,
      ivec2(int(anchorIndex), int(patternIndex)),
      0
    ).rg;
    normalizedAnchor = transformAnchor(normalizedAnchor, cellHashValue);

    uint anchorHashValue = vegetationAnchorHash(cellHashValue, anchorIndex);
    uint elementHashValue = vegetationElementHash(anchorHashValue, elementIndex);
    uint detailHashValue = vegetationElementDetailHash(elementHashValue);
    float offsetAngle = readHashRatio(
      detailHashValue,
      ${ELEMENT_OFFSET_ANGLE_BITS.offset}u
    ) * 6.28318530718;
    float offsetRadius = sqrt(readHashRatio(
      detailHashValue,
      ${ELEMENT_OFFSET_RADIUS_BITS.offset}u
    )) * maximumBladeOffset;
    vec2 elementOffset = vec2(cos(offsetAngle), sin(offsetAngle))
      * offsetRadius;

    float cellSize = chunkSize / float(maskResolution);
    vec2 elementCellPosition = clamp(
      normalizedAnchor + elementOffset / cellSize,
      0.0,
      1.0
    );
    vec2 chunkUv = (
      vec2(localCell) + elementCellPosition
    ) / float(maskResolution);
    vec2 chunkMinimum = gridOrigin + vec2(chunkGrid) * chunkSize;
    vec2 horizontalPosition = chunkMinimum + chunkUv * chunkSize;
    vec2 heightRange = texelFetch(
      chunkHeightRanges,
      ivec2(int(storedChunkIndex), 0),
      0
    ).rg;
    float baseHeight = useTwoSampleHeight
      ? averageDiagonalHeight(storedChunkIndex, chunkUv, heightRange)
      : interpolateHeight(storedChunkIndex, chunkUv, heightRange);
    vec3 basePosition = horizontalAxisA * horizontalPosition.x
      + horizontalAxisB * horizontalPosition.y
      + upAxis * baseHeight;
    cameraDistanceMeters = distance(basePosition, cameraPositionModel) / unitsPerMeter;
    float growth = bladeGrowth(
      selectedCellIndex,
      anchorIndex,
      elementIndex,
      cellHashValue,
      anchorHashValue,
      elementHashValue,
      cameraDistanceMeters
    );
    float thicknessProgress = exponentialProgress(
      cameraDistanceMeters,
      bladeThicknessDistance,
      bladeThicknessCurveStrength
    );
    float thicknessScale = mix(
      bladeThicknessScale.x,
      bladeThicknessScale.y,
      thicknessProgress
    );

    float orientationAngle = readHashRatio(
      elementHashValue,
      ${ELEMENT_ORIENTATION_BITS.offset}u
    ) * 6.28318530718;
    vec3 bladeForward = horizontalAxisA * cos(orientationAngle)
      + horizontalAxisB * sin(orientationAngle);
    vec3 bladeRight = horizontalAxisA * -sin(orientationAngle)
      + horizontalAxisB * cos(orientationAngle);
    float tiltRadians = readHashRatio(
      elementHashValue,
      ${ELEMENT_TILT_BITS.offset}u
    ) * maximumBladeTiltRadians;
    vec3 bladeDirection = normalize(
      upAxis * cos(tiltRadians) + bladeForward * sin(tiltRadians)
    );
    float elementHeight = mix(
      bladeHeight.x,
      bladeHeight.y,
      readHashRatio(elementHashValue, ${ELEMENT_HEIGHT_BITS.offset}u)
    );
    float elementWidth = mix(
      bladeWidth.x,
      bladeWidth.y,
      readHashRatio(elementHashValue, ${ELEMENT_WIDTH_BITS.offset}u)
    );
    float widthAtHeight = elementWidth
      * mix(1.0, bladeTopWidthRatio, position.y)
      * thicknessScale;
    float visibleBladeRatio = mix(
      lodTransitionStartVisibleRatio,
      1.0,
      growth
    );
    float verticalBladeHeight = dot(bladeDirection, upAxis) * elementHeight;
    vec3 modelPosition = basePosition
      - upAxis * verticalBladeHeight * (1.0 - visibleBladeRatio)
      + bladeRight * position.x * widthAtHeight
      + bladeDirection * position.y * elementHeight;

    uint bottomColorIndex = readHashByte(
      detailHashValue,
      ${ELEMENT_BOTTOM_COLOR_BITS.offset}u
    ) % bottomColorCount;
    uint topColorIndex = readHashByte(
      detailHashValue,
      ${ELEMENT_TOP_COLOR_BITS.offset}u
    ) % topColorCount;
    bladeBottomColor = texelFetch(
      bottomColors,
      ivec2(int(bottomColorIndex), 0),
      0
    ).rgb;
    bladeTopColor = texelFetch(
      topColors,
      ivec2(int(topColorIndex), 0),
      0
    ).rgb;
    modelNormal = normalize(cross(bladeRight, bladeDirection));
    bladeHeightRatio = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(modelPosition, 1.0);
  }
`;
