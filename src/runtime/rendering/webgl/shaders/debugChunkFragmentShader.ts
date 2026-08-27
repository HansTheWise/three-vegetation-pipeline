import { vegetationIdentityShader } from './vegetationIdentityShader.js';

export const debugChunkFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform highp usampler2D layerMask;
  uniform highp sampler2D patternPositions;
  uniform uint seed;
  uniform uint layerId;
  uniform uint patternCount;
  uniform int maskResolution;
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

  ${vegetationIdentityShader}

  bool isActiveCell(ivec2 cell) {
    int cellIndex = cell.y * maskResolution + cell.x;
    int wordIndex = cellIndex / 32;
    int bitIndex = cellIndex - wordIndex * 32;
    uint word = texelFetch(
      layerMask,
      ivec2(wordIndex, int(storedChunkIndex)),
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
    float phase = float(anchorIndex) * 2.39996323;
    return 0.55 + 0.45 * cos(phase + vec3(0.0, 2.094, 4.188));
  }

  void main() {
    vec2 scaledUv = min(chunkUv, vec2(0.999999)) * float(maskResolution);
    ivec2 cell = ivec2(floor(scaledUv));
    vec2 cellUv = fract(scaledUv);
    uvec2 globalCell = chunkGridCoordinates * uint(maskResolution) + uvec2(cell);
    uint hash = vegetationCellHash(seed, layerId, globalCell);
    uint patternIndex = cellPatternValue(hash) % patternCount;
    bool cellIsActive = isActiveCell(cell);

    vec3 baseColor = (patternIndex & 1u) == 0u ? evenChunkColor : oddChunkColor;
    if (!cellIsActive) baseColor = vec3(0.025, 0.04, 0.065);

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
    float gridLine = 1.0 - smoothstep(0.015, 0.035, gridDistance);
    float anchorPoint = cellIsActive
      ? 1.0 - smoothstep(0.045, 0.075, closestAnchorDistance)
      : 0.0;
    vec3 color = mix(baseColor, vec3(0.2, 0.35, 0.48), gridLine);
    color = mix(color, anchorColor(closestAnchorIndex), anchorPoint);
    float alpha = cellIsActive ? opacity : opacity * 0.18;
    alpha = max(alpha, gridLine * opacity * 0.45);
    alpha = max(alpha, anchorPoint);
    outputColor = vec4(color, alpha);
  }
`;
