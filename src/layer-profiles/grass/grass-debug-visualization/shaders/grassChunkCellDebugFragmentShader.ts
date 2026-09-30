import { vegetationIdentityShader } from '../../../reusable-profile-features/deterministic-vegetation-identity/webgl/vegetationIdentityShader.js';

export const grassChunkCellDebugFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform highp usampler2D layerMask;
  uniform highp sampler2D patternPositions;
  uniform uint seed;
  uniform uint vegetationLayerId;
  uniform uint patternCount;
  uniform int maskResolutionPerChunkAxis;
  uniform int visibleAnchorCount;
  uniform bool rotatePerCell;
  uniform bool reflectPerCell;
  uniform vec3 evenChunkColor;
  uniform vec3 oddChunkColor;
  uniform float opacity;

  flat in uint storedChunkIndex;
  flat in uvec2 chunkGridCoordinates;
  in vec2 chunkUv;
  out vec4 outputColor;

  const int MASK_BITS_PER_WORD = 32;
  const int MASK_WORD_ROUNDING_OFFSET = MASK_BITS_PER_WORD - 1;
  const float MAXIMUM_CHUNK_UV = 0.999999;
  const float GRID_LINE_START = 0.015;
  const float GRID_LINE_END = 0.035;
  const float ANCHOR_POINT_START = 0.045;
  const float ANCHOR_POINT_END = 0.075;
  const float INACTIVE_CELL_OPACITY_FACTOR = 0.18;
  const float GRID_LINE_OPACITY_FACTOR = 0.45;
  const float ANCHOR_COLOR_PHASE_STEP = 2.39996323;
  const vec3 INACTIVE_CELL_COLOR = vec3(0.025, 0.04, 0.065);
  const vec3 GRID_LINE_COLOR = vec3(0.2, 0.35, 0.48);
  const vec3 ANCHOR_COLOR_PHASE_OFFSETS = vec3(0.0, 2.094, 4.188);

  ${vegetationIdentityShader}

  ivec2 linearTextureCoordinate(int linearIndex, int textureWidth) {
    return ivec2(linearIndex % textureWidth, linearIndex / textureWidth);
  }

  bool isActiveCell(ivec2 cell) {
    int cellIndex = cell.y * maskResolutionPerChunkAxis + cell.x;
    int wordIndex = cellIndex / MASK_BITS_PER_WORD;
    int bitIndex = cellIndex - wordIndex * MASK_BITS_PER_WORD;
    int maskWordsPerChunk = (
      maskResolutionPerChunkAxis * maskResolutionPerChunkAxis + MASK_WORD_ROUNDING_OFFSET
    ) / MASK_BITS_PER_WORD;
    int linearWordIndex = int(storedChunkIndex) * maskWordsPerChunk + wordIndex;
    uint word = texelFetch(
      layerMask,
      linearTextureCoordinate(linearWordIndex, textureSize(layerMask, 0).x),
      0
    ).r;
    return ((word >> uint(bitIndex)) & 1u) == 1u;
  }

  vec2 transformAnchor(vec2 anchor, uint hash) {
    if (reflectPerCell && cellIsReflected(hash)) {
      anchor.x = 1.0 - anchor.x;
    }
    uint quarterTurns = rotatePerCell ? cellRotationQuarterTurns(hash) : 0u;
    for (uint turn = 0u; turn < quarterTurns; turn += 1u) {
      anchor = vec2(1.0 - anchor.y, anchor.x);
    }
    return anchor;
  }

  vec3 anchorColor(int anchorIndex) {
    float phase = float(anchorIndex) * ANCHOR_COLOR_PHASE_STEP;
    return 0.55 + 0.45 * cos(phase + ANCHOR_COLOR_PHASE_OFFSETS);
  }

  void main() {
    vec2 scaledUv = min(chunkUv, vec2(MAXIMUM_CHUNK_UV)) * float(maskResolutionPerChunkAxis);
    ivec2 cell = ivec2(floor(scaledUv));
    vec2 cellUv = fract(scaledUv);
    uvec2 globalCell = chunkGridCoordinates * uint(maskResolutionPerChunkAxis) + uvec2(cell);
    uint hash = vegetationCellHash(seed, vegetationLayerId, globalCell);
    uint patternIndex = cellPatternValue(hash) % patternCount;
    bool cellIsActive = isActiveCell(cell);

    vec3 baseColor = (patternIndex & 1u) == 0u ? evenChunkColor : oddChunkColor;
    if (!cellIsActive) baseColor = INACTIVE_CELL_COLOR;

    float closestAnchorDistance = 2.0;
    int closestAnchorIndex = 0;
    for (int anchorIndex = 0; anchorIndex < visibleAnchorCount; anchorIndex += 1) {
      vec2 anchor = texelFetch(
        patternPositions,
        ivec2(anchorIndex, int(patternIndex)),
        0
      ).rg;
      anchor = transformAnchor(anchor, hash);
      float anchorDistance = distance(cellUv, anchor);
      if (anchorDistance < closestAnchorDistance) {
        closestAnchorDistance = anchorDistance;
        closestAnchorIndex = anchorIndex;
      }
    }

    float gridDistance = min(
      min(cellUv.x, 1.0 - cellUv.x),
      min(cellUv.y, 1.0 - cellUv.y)
    );
    float gridLine = 1.0 - smoothstep(GRID_LINE_START, GRID_LINE_END, gridDistance);
    float anchorPoint = cellIsActive
      ? 1.0 - smoothstep(ANCHOR_POINT_START, ANCHOR_POINT_END, closestAnchorDistance)
      : 0.0;
    vec3 color = mix(baseColor, GRID_LINE_COLOR, gridLine);
    color = mix(color, anchorColor(closestAnchorIndex), anchorPoint);
    float alpha = cellIsActive ? opacity : opacity * INACTIVE_CELL_OPACITY_FACTOR;
    alpha = max(alpha, gridLine * opacity * GRID_LINE_OPACITY_FACTOR);
    alpha = max(alpha, anchorPoint);
    outputColor = vec4(color, alpha);
  }
`;
