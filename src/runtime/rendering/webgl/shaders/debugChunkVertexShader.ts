export const debugChunkVertexShader = /* glsl */ `
  precision highp float;
  precision highp int;

  in vec3 position;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform highp usampler2D visibleChunkIndices;
  uniform highp usampler2D storedChunkGridCoordinates;
  uniform highp sampler2D chunkHeightRanges;
  uniform highp usampler2D heightData;
  uniform vec2 gridOrigin;
  uniform float chunkSize;
  uniform int heightResolution;
  uniform float maximumQuantizedHeight;
  uniform vec3 horizontalAxisA;
  uniform vec3 horizontalAxisB;
  uniform vec3 upAxis;
  uniform float heightOffset;

  flat out uint storedChunkIndex;
  flat out uvec2 chunkGridCoordinates;
  out vec2 chunkUv;

  void main() {
    storedChunkIndex = texelFetch(
      visibleChunkIndices,
      ivec2(gl_InstanceID, 0),
      0
    ).r;
    chunkGridCoordinates = texelFetch(
      storedChunkGridCoordinates,
      ivec2(int(storedChunkIndex), 0),
      0
    ).rg;
    vec2 heightRange = texelFetch(
      chunkHeightRanges,
      ivec2(int(storedChunkIndex), 0),
      0
    ).rg;

    chunkUv = position.xy;
    ivec2 heightCoordinate = ivec2(
      round(chunkUv * float(heightResolution - 1))
    );
    int heightIndex = heightCoordinate.y * heightResolution + heightCoordinate.x;
    uint quantizedHeight = texelFetch(
      heightData,
      ivec2(heightIndex, int(storedChunkIndex)),
      0
    ).r;
    float heightRatio = float(quantizedHeight) / maximumQuantizedHeight;
    float height = mix(heightRange.x, heightRange.y, heightRatio);

    vec2 chunkMinimum = gridOrigin
      + vec2(chunkGridCoordinates) * chunkSize;
    vec2 horizontalPosition = chunkMinimum + chunkUv * chunkSize;
    vec3 modelPosition = horizontalAxisA * horizontalPosition.x
      + horizontalAxisB * horizontalPosition.y
      + upAxis * (height + heightOffset);

    gl_Position = projectionMatrix
      * modelViewMatrix
      * vec4(modelPosition, 1.0);
  }
`;
