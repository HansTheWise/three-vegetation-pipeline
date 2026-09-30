import {
  ELEMENT_BOTTOM_COLOR_BITS,
  ELEMENT_HEIGHT_BITS,
  ELEMENT_OFFSET_ANGLE_BITS,
  ELEMENT_OFFSET_RADIUS_BITS,
  ELEMENT_ORIENTATION_BITS,
  ELEMENT_TILT_BITS,
  ELEMENT_TOP_COLOR_BITS,
  ELEMENT_WIDTH_BITS,
} from '../../../reusable-profile-features/deterministic-vegetation-identity/ElementHashLayout.js';
import { vegetationIdentityShader } from '../../../reusable-profile-features/deterministic-vegetation-identity/webgl/vegetationIdentityShader.js';

export const grassVertexShader = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform highp usampler2D visibleTileRecords;
  uniform highp usampler2D activeCellIndices;
  uniform highp usampler2D storedChunkGridCoordinateLookup;
  uniform highp sampler2D chunkHeightRanges;
  uniform highp usampler2D heightData;
  uniform highp sampler2D patternPositions;
  uniform highp sampler2D bottomColors;
  uniform highp sampler2D topColors;
  uniform uint seed;
  uniform uint vegetationLayerId;
  uniform uint patternCount;
  uniform uint maskResolutionPerChunkAxis;
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
  uniform int heightMapResolutionPerChunkAxis;
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
  uniform vec2 verticalColorTransition;

  #ifdef GROUND_COLOR_SOURCE
    uniform sampler2D groundPatchField;
    uniform vec3 groundBaseColor;
    uniform float groundBrightnessVariation;
    uniform vec2 groundOrigin;
    uniform vec2 groundExtent;
    uniform vec2 groundColorBias;
  #endif

  #ifdef GROUND_COLOR_FADE
    uniform vec3 bottomGroundTransition;
    uniform vec3 topGroundTransition;
  #endif

  #ifdef CLOVER
    uniform float cloverMaximumRatio;
    uniform float cloverGroundColorBias;
    uniform vec3 cloverPreferredGroundColor;
    uniform float cloverColorTolerance;
    uniform vec2 cloverSize;
    uniform float cloverHeightOffset;
    uniform vec3 cloverBaseColor;
    uniform vec3 cloverHighlightColor;
  #endif

  flat out vec3 bladeBottomColor;
  flat out vec3 bladeTopColor;
  flat out vec3 groundNormalView;
  out vec3 vViewPosition;
  out float bladeHeightRatio;
  out float cameraDistanceMeters;
  #ifdef CLOVER
    flat out uint renderCloverFragment;
    flat out vec3 cloverHighlightColorValue;
    out vec2 cloverUv;
  #endif

  #include <grass_lighting_pars_vertex>

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

  ivec2 linearTextureCoordinate(int linearIndex, int textureWidth) {
    return ivec2(linearIndex % textureWidth, linearIndex / textureWidth);
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
    int heightIndex = coordinate.y * heightMapResolutionPerChunkAxis + coordinate.x;
    int heightValuesPerChunk = heightMapResolutionPerChunkAxis * heightMapResolutionPerChunkAxis;
    int linearHeightIndex = int(storedChunkIndex) * heightValuesPerChunk + heightIndex;
    uint quantizedHeight = texelFetch(
      heightData,
      linearTextureCoordinate(linearHeightIndex, textureSize(heightData, 0).x),
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
      * float(heightMapResolutionPerChunkAxis - 1);
    ivec2 minimumCoordinate = ivec2(floor(samplePosition));
    ivec2 maximumCoordinate = min(
      minimumCoordinate + ivec2(1),
      ivec2(heightMapResolutionPerChunkAxis - 1)
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
    float sampleSpacing = chunkSize / float(heightMapResolutionPerChunkAxis - 1);
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

  #ifdef GROUND_COLOR_SOURCE
    vec3 sampleGroundColor(vec2 horizontalPosition) {
      vec2 patchUv = (horizontalPosition - groundOrigin) / groundExtent;
      vec2 patchValue = textureLod(groundPatchField, patchUv, 0.0).rg;
      float patchInBounds = step(0.0, patchUv.x) * step(0.0, patchUv.y)
        * step(patchUv.x, 1.0) * step(patchUv.y, 1.0);
      float patchBrightness = 1.0 + groundBrightnessVariation
        * patchValue.r * patchInBounds * (patchValue.g * 2.0 - 1.0);
      return clamp(groundBaseColor * patchBrightness, vec3(0.0), vec3(1.0));
    }
  #endif

  void hideInactiveBlade() {
    bladeBottomColor = vec3(0.0);
    bladeTopColor = vec3(0.0);
    groundNormalView = vec3(0.0, 1.0, 0.0);
    vViewPosition = vec3(0.0);
    bladeHeightRatio = position.y;
    cameraDistanceMeters = 0.0;
    #ifdef CLOVER
      renderCloverFragment = 0u;
      cloverHighlightColorValue = vec3(0.0);
      cloverUv = vec2(0.0);
    #endif
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
      localCellIndex % maskResolutionPerChunkAxis,
      localCellIndex / maskResolutionPerChunkAxis
    );
    uvec2 chunkGrid = texelFetch(
      storedChunkGridCoordinateLookup,
      linearTextureCoordinate(
        int(storedChunkIndex),
        textureSize(storedChunkGridCoordinateLookup, 0).x
      ),
      0
    ).rg;
    uvec2 globalCell = chunkGrid * maskResolutionPerChunkAxis + localCell;
    uint cellHashValue = vegetationCellHash(seed, vegetationLayerId, globalCell);
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

    float cellSize = chunkSize / float(maskResolutionPerChunkAxis);
    vec2 elementCellPosition = clamp(
      normalizedAnchor + elementOffset / cellSize,
      0.0,
      1.0
    );
    vec2 chunkUv = (
      vec2(localCell) + elementCellPosition
    ) / float(maskResolutionPerChunkAxis);
    vec2 chunkMinimum = gridOrigin + vec2(chunkGrid) * chunkSize;
    vec2 anchorHorizontalPosition = chunkMinimum
      + (vec2(localCell) + normalizedAnchor) / float(maskResolutionPerChunkAxis) * chunkSize;
    vec2 horizontalPosition = chunkMinimum + chunkUv * chunkSize;
    vec2 heightRange = texelFetch(
      chunkHeightRanges,
      linearTextureCoordinate(
        int(storedChunkIndex),
        textureSize(chunkHeightRanges, 0).x
      ),
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
    #ifdef GROUND_COLOR_SOURCE
      vec3 groundColor = sampleGroundColor(horizontalPosition);
    #endif
    #ifdef CLOVER
      vec3 anchorGroundColor = sampleGroundColor(anchorHorizontalPosition);
      float cloverAffinity = 1.0 - smoothstep(
        0.0,
        cloverColorTolerance,
        distance(anchorGroundColor, cloverPreferredGroundColor)
      );
      float cloverProbability = cloverMaximumRatio * mix(
        1.0,
        cloverAffinity,
        cloverGroundColorBias
      );
      bool renderClover = float(anchorSpeciesValue(anchorHashValue)) / 65536.0
        < cloverProbability;
      renderCloverFragment = renderClover ? 1u : 0u;
      cloverHighlightColorValue = cloverHighlightColor;
      cloverUv = vec2(0.0);
    #endif
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
    vec3 modelPosition;
    #ifdef CLOVER
      if (renderClover) {
        float cloverAngle = float(anchorOrientationValue(anchorHashValue))
          / 256.0 * 6.28318530718;
        vec3 cloverRight = horizontalAxisA * cos(cloverAngle)
          + horizontalAxisB * sin(cloverAngle);
        vec3 cloverForward = horizontalAxisA * -sin(cloverAngle)
          + horizontalAxisB * cos(cloverAngle);
        vec2 cloverPosition;
        if (position.y < 0.001) {
          cloverPosition = vec2(
            position.x < 0.0 ? -0.43301270189 : 0.43301270189,
            -0.25
          );
          cloverUv = vec2(position.x < 0.0 ? 0.0 : 1.0, 0.0);
        } else if (position.x < 0.0) {
          cloverPosition = vec2(-0.43301270189, -0.25);
          cloverUv = vec2(0.0, 0.0);
        } else {
          cloverPosition = vec2(0.0, 0.5);
          cloverUv = vec2(0.5, 1.0);
        }
        if (anchorIsReflected(anchorHashValue)) {
          cloverPosition.y = -cloverPosition.y;
        }
        float elementCloverSize = mix(
          cloverSize.x,
          cloverSize.y,
          readHashRatio(elementHashValue, ${ELEMENT_WIDTH_BITS.offset}u)
        );
        modelPosition = basePosition
          + upAxis * cloverHeightOffset
          + cloverRight * cloverPosition.x * elementCloverSize
          + cloverForward * cloverPosition.y * elementCloverSize;
      } else {
        modelPosition = basePosition
          + bladeRight * position.x * widthAtHeight
          + bladeDirection * position.y * elementHeight;
      }
    #else
      modelPosition = basePosition
        + bladeRight * position.x * widthAtHeight
        + bladeDirection * position.y * elementHeight;
    #endif

    uint bottomColorIndex = readHashByte(
      detailHashValue,
      ${ELEMENT_BOTTOM_COLOR_BITS.offset}u
    ) % bottomColorCount;
    uint topColorIndex = readHashByte(
      detailHashValue,
      ${ELEMENT_TOP_COLOR_BITS.offset}u
    ) % topColorCount;
    #ifdef CLOVER
      if (renderClover) {
        bladeBottomColor = cloverBaseColor;
        bladeTopColor = cloverBaseColor;
      } else {
    #endif
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
    #ifdef CLOVER
      }
    #endif
    #ifdef GROUND_COLOR_SOURCE
      vec2 effectiveGroundColorBias = groundColorBias;
    #ifdef GROUND_COLOR_FADE
      float bottomGroundProgress = bottomGroundTransition.z < 0.001
        ? clamp((cameraDistanceMeters - bottomGroundTransition.x)
          / (bottomGroundTransition.y - bottomGroundTransition.x), 0.0, 1.0)
        : exponentialProgress(
          cameraDistanceMeters,
          bottomGroundTransition.xy,
          bottomGroundTransition.z
        );
      float topGroundProgress = topGroundTransition.z < 0.001
        ? clamp((cameraDistanceMeters - topGroundTransition.x)
          / (topGroundTransition.y - topGroundTransition.x), 0.0, 1.0)
        : exponentialProgress(
          cameraDistanceMeters,
          topGroundTransition.xy,
          topGroundTransition.z
        );
      effectiveGroundColorBias = mix(
        effectiveGroundColorBias,
        vec2(1.0),
        vec2(bottomGroundProgress, topGroundProgress)
      );
    #endif
      bladeBottomColor = mix(
        bladeBottomColor,
        groundColor,
        effectiveGroundColorBias.x
      );
      bladeTopColor = mix(
        bladeTopColor,
        groundColor,
        effectiveGroundColorBias.y
      );
      #ifdef CLOVER
        if (renderClover) {
          float cloverVerticalColorRatio = verticalColorTransition.y
              > verticalColorTransition.x
            ? smoothstep(
              verticalColorTransition.x,
              verticalColorTransition.y,
              0.5
            )
            : step(verticalColorTransition.x, 0.5);
          float cloverGroundColorBias = mix(
            effectiveGroundColorBias.x,
            effectiveGroundColorBias.y,
            cloverVerticalColorRatio
          );
          cloverHighlightColorValue = mix(
            cloverHighlightColorValue,
            groundColor,
            cloverGroundColorBias
          );
        }
      #endif
    #endif
    groundNormalView = normalize(normalMatrix * groundNormalModel);
    // Use the reconstructed ground surface for Three.js shadow.normalBias too.
    vec3 transformedNormal = groundNormalView;
    #ifdef CLOVER
      bladeHeightRatio = renderClover ? 0.5 : position.y;
    #else
      bladeHeightRatio = position.y;
    #endif
    vec4 viewPosition = modelViewMatrix * vec4(modelPosition, 1.0);
    vViewPosition = -viewPosition.xyz;
    // Sample incoming shadows at the root so elevated blade vertices do not
    // shift out of long, low-sun shadows cast onto the terrain.
    vec4 worldPosition = modelMatrix * vec4(basePosition, 1.0);
    #include <grass_shadowmap_vertex>
    gl_Position = projectionMatrix * viewPosition;
  }
`;
