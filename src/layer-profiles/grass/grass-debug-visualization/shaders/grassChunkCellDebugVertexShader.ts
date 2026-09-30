export const grassChunkCellDebugVertexShader = /* glsl */ `
  precision highp float;
  precision highp int;

  in vec3 position;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform highp usampler2D visibleStoredChunkIndices;
  uniform highp usampler2D storedChunkGridCoordinateLookup;
  uniform highp sampler2D chunkHeightRanges;
  uniform highp usampler2D heightData;
  uniform vec2 gridOrigin;
  uniform float chunkSize;
  uniform int heightMapResolutionPerChunkAxis;
  uniform float maximumQuantizedHeight;
  uniform vec3 horizontalAxisA;
  uniform vec3 horizontalAxisB;
  uniform vec3 upAxis;
  uniform float heightOffset;

  flat out uint storedChunkIndex;
  flat out uvec2 chunkGridCoordinates;
  out vec2 chunkUv;

  ivec2 linearTextureCoordinate(int linearIndex, int textureWidth) {
    return ivec2(linearIndex % textureWidth, linearIndex / textureWidth);
  }

  void main() {
    storedChunkIndex = texelFetch(
      visibleStoredChunkIndices,
      linearTextureCoordinate(
        gl_InstanceID,
        textureSize(visibleStoredChunkIndices, 0).x
      ),
      0
    ).r;
    chunkGridCoordinates = texelFetch(
      storedChunkGridCoordinateLookup,
      linearTextureCoordinate(
        int(storedChunkIndex),
        textureSize(storedChunkGridCoordinateLookup, 0).x
      ),
      0
    ).rg;
    vec2 heightRange = texelFetch(
      chunkHeightRanges,
      linearTextureCoordinate(
        int(storedChunkIndex),
        textureSize(chunkHeightRanges, 0).x
      ),
      0
    ).rg;

    chunkUv = position.xy;
    ivec2 heightCoordinate = ivec2(
      round(chunkUv * float(heightMapResolutionPerChunkAxis - 1))
    );
    int heightIndex = heightCoordinate.y * heightMapResolutionPerChunkAxis + heightCoordinate.x;
    int heightValuesPerChunk = heightMapResolutionPerChunkAxis * heightMapResolutionPerChunkAxis;
    int linearHeightIndex = int(storedChunkIndex) * heightValuesPerChunk + heightIndex;
    uint quantizedHeight = texelFetch(
      heightData,
      linearTextureCoordinate(linearHeightIndex, textureSize(heightData, 0).x),
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
