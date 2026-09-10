export const grassFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 verticalColorTransition;
  uniform vec3 distanceColorFarTint;
  uniform vec2 distanceColorRange;
  uniform float distanceColorCurveStrength;
  uniform vec2 lightWeights;

  #ifdef LIGHTING_NORMAL_MIXED
    uniform float groundNormalWeight;
  #endif

  #ifdef LIGHT_DISTANCE_TRANSITION
    uniform vec2 distanceLightWeights;
    uniform vec3 bottomLightTransition;
    uniform vec3 topLightTransition;
  #endif

  flat in vec3 bladeBottomColor;
  flat in vec3 bladeTopColor;
  flat in vec3 groundNormalView;
  in vec3 vViewPosition;
  in float bladeHeightRatio;
  in float cameraDistanceMeters;

  out vec4 outputColor;

  #include <vegetation_lighting_pars_fragment>

  float exponentialProgress(float distanceMeters, vec2 distanceRange, float strength) {
    float ratio = clamp(
      (distanceMeters - distanceRange.x) / (distanceRange.y - distanceRange.x),
      0.0,
      1.0
    );
    if (strength < 0.001) return ratio;
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
    vegetationDirectLightWeight = lightWeights.x;
    vegetationIndirectLightWeight = lightWeights.y;
    #ifdef LIGHT_DISTANCE_TRANSITION
      float bottomLightProgress = exponentialProgress(
        cameraDistanceMeters,
        bottomLightTransition.xy,
        bottomLightTransition.z
      );
      float topLightProgress = exponentialProgress(
        cameraDistanceMeters,
        topLightTransition.xy,
        topLightTransition.z
      );
      float lightProgress = mix(
        bottomLightProgress,
        topLightProgress,
        colorTransition
      );
      vegetationDirectLightWeight = mix(
        lightWeights.x,
        distanceLightWeights.x,
        lightProgress
      );
      vegetationIndirectLightWeight = mix(
        lightWeights.y,
        distanceLightWeights.y,
        lightProgress
      );
    #endif
    #ifndef GROUND_COLOR_TRANSITION
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
    #endif

    #if defined(LIGHTING_NORMAL_GEOMETRY) || defined(LIGHTING_NORMAL_MIXED)
      vec3 geometryNormalView = normalize(cross(
        dFdx(vViewPosition),
        dFdy(vViewPosition)
      ));
      #ifdef DOUBLE_SIDED
        geometryNormalView *= gl_FrontFacing ? 1.0 : -1.0;
      #endif
    #endif
    #ifdef LIGHTING_NORMAL_GEOMETRY
      vec3 vegetationLightingNormal = geometryNormalView;
    #elif defined(LIGHTING_NORMAL_MIXED)
      vec3 vegetationLightingNormal = normalize(mix(
        geometryNormalView,
        groundNormalView,
        groundNormalWeight
      ));
    #else
      vec3 vegetationLightingNormal = normalize(groundNormalView);
    #endif
    vec3 vegetationDiffuseColor = grassColor;

    #include <vegetation_lighting_fragment>
    #include <vegetation_tonemapping_fragment>
    #include <vegetation_colorspace_fragment>
  }
`;
