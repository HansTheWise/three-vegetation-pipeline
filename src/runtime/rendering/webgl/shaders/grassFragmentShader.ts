export const grassFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 verticalColorTransition;
  uniform float lightingNormalUpBias;
  uniform vec3 upAxis;
  uniform vec3 directionalLightDirection;
  uniform vec3 ambientLightColor;
  uniform vec3 directionalLightColor;
  uniform vec3 distanceColorFarTint;
  uniform vec2 distanceColorRange;
  uniform float distanceColorCurveStrength;

  flat in vec3 bladeBottomColor;
  flat in vec3 bladeTopColor;
  in vec3 modelNormal;
  in float bladeHeightRatio;
  in float cameraDistanceMeters;
  out vec4 outputColor;

  #include <colorspace_pars_fragment>

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

  void main() {
    float colorTransition = verticalColorTransition.y
        > verticalColorTransition.x
      ? smoothstep(
        verticalColorTransition.x,
        verticalColorTransition.y,
        bladeHeightRatio
      )
      : step(verticalColorTransition.x, bladeHeightRatio);
    vec3 grassColor = mix(
      bladeBottomColor,
      bladeTopColor,
      colorTransition
    );
    float distanceColorProgress = exponentialProgress(
      cameraDistanceMeters,
      distanceColorRange,
      distanceColorCurveStrength
    );
    grassColor *= mix(
      vec3(1.0),
      distanceColorFarTint,
      distanceColorProgress
    );

    vec3 visibleNormal = gl_FrontFacing
      ? normalize(modelNormal)
      : -normalize(modelNormal);
    vec3 lightingNormal = normalize(mix(
      visibleNormal,
      upAxis,
      lightingNormalUpBias
    ));
    float directLight = max(dot(lightingNormal, directionalLightDirection), 0.0);
    vec3 lighting = ambientLightColor + directionalLightColor * directLight;
    outputColor = vec4(grassColor * lighting, 1.0);
    outputColor = sRGBTransferOETF(outputColor);
  }
`;
