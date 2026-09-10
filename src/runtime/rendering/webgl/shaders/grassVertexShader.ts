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
import { vegetationIdentityShader } from './vegetationIdentityShader.js';

export const grassVertexShader = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform highp usampler2D visibleTileRecords;
  uniform highp usampler2D activeCellIndices;
  uniform highp usampler2D storedChunkGridCoordinates;
  uniform highp sampler2D chunkHeightRanges;
  uniform highp usampler2D heightData;
  uniform highp sampler2D patternPositions;
  uniform highp sampler2D bottomColors;
  uniform highp sampler2D topColors;
  uniform uint seed;
  uniform uint layerId;
  uniform uint patternCount;
  uniform uint maskResolution;
  uniform int visibleTileTextureWidth;
  uniform int activeCellTextureWidth;
  uniform uint tileRecordOffset;
  uniform uint bucketCandidateCapacity;
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
  uniform vec2 cameraFacingDistance;
  uniform float maximumBladeOffset;
  uniform bool useTwoSampleHeight;
  uniform vec2 bladeThicknessDistance;
  uniform vec2 bladeThicknessScale;
  uniform float bladeThicknessCurveStrength;

  #ifdef GROUND_COLOR_TRANSITION
    uniform sampler2D groundPatchField;
    uniform vec3 groundBaseColor;
    uniform float groundBrightnessVariation;
    uniform vec2 groundOrigin;
    uniform vec2 groundExtent;
    uniform vec3 bottomGroundTransition;
    uniform vec3 topGroundTransition;
  #endif

  flat out vec3 bladeBottomColor;
  flat out vec3 bladeTopColor;
  flat out vec3 groundNormalView;
  out vec3 vViewPosition;
  out float bladeHeightRatio;
  out float cameraDistanceMeters;

  #include <vegetation_lighting_pars_vertex>

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

  uvec4 readVisibleTile(uint visibleTileIndex) {
    uint recordIndex = tileRecordOffset + visibleTileIndex;
    uint textureWidth = uint(visibleTileTextureWidth);
    ivec2 coordinate = ivec2(
      int(recordIndex % textureWidth),
      int(recordIndex / textureWidth)
    );
    return texelFetch(visibleTileRecords, coordinate, 0);
  }

  uint readActiveCellIndex(uint activeCellIndex) {
    uint textureWidth = uint(activeCellTextureWidth);
    ivec2 coordinate = ivec2(
      int(activeCellIndex % textureWidth),
      int(activeCellIndex / textureWidth)
    );
    return texelFetch(activeCellIndices, coordinate, 0).r;
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

  vec3 interpolateHeightSurface(
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
    float height = mix(
      mix(lowerLeft, lowerRight, sampleRatio.x),
      mix(upperLeft, upperRight, sampleRatio.x),
      sampleRatio.y
    );
    float sampleSpacing = chunkSize / float(heightResolution - 1);
    vec2 gradient = vec2(
      mix(lowerRight - lowerLeft, upperRight - upperLeft, sampleRatio.y),
      mix(upperLeft - lowerLeft, upperRight - lowerRight, sampleRatio.x)
    ) / sampleSpacing;
    float sampledHeight = useTwoSampleHeight
      ? (lowerLeft + upperRight) * 0.5
      : height;
    return vec3(sampledHeight, gradient);
  }

  vec3 createGroundNormal(vec2 heightGradient) {
    return normalize(
      upAxis
      - horizontalAxisA * heightGradient.x
      - horizontalAxisB * heightGradient.y
    );
  }

  void hideInactiveBlade() {
    bladeBottomColor = vec3(0.0);
    bladeTopColor = vec3(0.0);
    groundNormalView = vec3(0.0, 1.0, 0.0);
    vViewPosition = vec3(0.0);
    bladeHeightRatio = position.y;
    cameraDistanceMeters = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }

  void main() {
    uint instanceIndex = uint(gl_InstanceID);
    uint visibleTileIndex = instanceIndex / bucketCandidateCapacity;
    uint candidateIndex = instanceIndex - visibleTileIndex * bucketCandidateCapacity;
    uvec4 visibleTile = readVisibleTile(visibleTileIndex);
    uint activeElementCount = visibleTile.a;
    if (candidateIndex >= activeElementCount) {
      hideInactiveBlade();
      return;
    }
    uint storedChunkIndex = visibleTile.x;
    uint activeCellOffset = visibleTile.y;
    uint activeCellCount = visibleTile.z & 0xffffu;
    uint activeAnchorCount = visibleTile.z >> 16u;
    uint activeAnchorIndex = candidateIndex % activeAnchorCount;
    uint elementIndex = candidateIndex / activeAnchorCount;
    uint selectedCellIndex = activeAnchorIndex % activeCellCount;
    uint anchorIndex = activeAnchorIndex / activeCellCount;
    uint localCellIndex = readActiveCellIndex(activeCellOffset + selectedCellIndex);
    uvec2 localCell = uvec2(
      localCellIndex % maskResolution,
      localCellIndex / maskResolution
    );
    uvec2 chunkGrid = texelFetch(
      storedChunkGridCoordinates,
      ivec2(int(storedChunkIndex), 0),
      0
    ).rg;
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
    vec3 heightSurface = interpolateHeightSurface(
      storedChunkIndex,
      chunkUv,
      heightRange
    );
    float baseHeight = heightSurface.x;
    vec3 groundNormalModel = createGroundNormal(heightSurface.yz);
    vec3 basePosition = horizontalAxisA * horizontalPosition.x
      + horizontalAxisB * horizontalPosition.y
      + upAxis * baseHeight;
    cameraDistanceMeters = distance(basePosition, cameraPositionModel) / unitsPerMeter;
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
    float cameraFacingProgress = smoothstep(
      cameraFacingDistance.x,
      cameraFacingDistance.y,
      cameraDistanceMeters
    );
    mat3 modelFromView = transpose(normalMatrix);
    vec3 cameraFacingRight = normalize(
      modelFromView * vec3(1.0, 0.0, 0.0)
    );
    vec3 cameraFacingUp = normalize(
      modelFromView * vec3(0.0, 1.0, 0.0)
    );
    if (dot(cameraFacingRight, bladeRight) < 0.0) {
      cameraFacingRight = -cameraFacingRight;
    }
    bladeRight = normalize(mix(
      bladeRight,
      cameraFacingRight,
      cameraFacingProgress
    ));
    bladeDirection = normalize(mix(
      bladeDirection,
      cameraFacingUp,
      cameraFacingProgress
    ));
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
    vec3 modelPosition = basePosition
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
    #ifdef GROUND_COLOR_TRANSITION
      // Match the ground patch albedo at the root, independently of blade tilt.
      vec2 patchUv = (horizontalPosition - groundOrigin) / groundExtent;
      vec2 patchValue = textureLod(groundPatchField, patchUv, 0.0).rg;
      float patchInBounds = step(0.0, patchUv.x) * step(0.0, patchUv.y)
        * step(patchUv.x, 1.0) * step(patchUv.y, 1.0);
      float patchBrightness = 1.0 + groundBrightnessVariation
        * patchValue.r * patchInBounds * (patchValue.g * 2.0 - 1.0);
      vec3 groundColor = clamp(groundBaseColor * patchBrightness, vec3(0.0), vec3(1.0));
      // Linear limit avoids cancellation for zero or nearly zero strength.
      float bottomProgress = bottomGroundTransition.z < 0.001
        ? clamp((cameraDistanceMeters - bottomGroundTransition.x)
          / (bottomGroundTransition.y - bottomGroundTransition.x), 0.0, 1.0)
        : exponentialProgress(cameraDistanceMeters, bottomGroundTransition.xy, bottomGroundTransition.z);
      float topProgress = topGroundTransition.z < 0.001
        ? clamp((cameraDistanceMeters - topGroundTransition.x)
          / (topGroundTransition.y - topGroundTransition.x), 0.0, 1.0)
        : exponentialProgress(cameraDistanceMeters, topGroundTransition.xy, topGroundTransition.z);
      bladeBottomColor = mix(bladeBottomColor, groundColor, bottomProgress);
      bladeTopColor = mix(bladeTopColor, groundColor, topProgress);
    #endif
    groundNormalView = normalize(normalMatrix * groundNormalModel);
    // Use the reconstructed ground surface for Three.js shadow.normalBias too.
    vec3 transformedNormal = groundNormalView;
    bladeHeightRatio = position.y;
    vec4 viewPosition = modelViewMatrix * vec4(modelPosition, 1.0);
    vViewPosition = -viewPosition.xyz;
    vec4 worldPosition = modelMatrix * vec4(modelPosition, 1.0);
    #include <vegetation_shadowmap_vertex>
    gl_Position = projectionMatrix * viewPosition;
  }
`;
