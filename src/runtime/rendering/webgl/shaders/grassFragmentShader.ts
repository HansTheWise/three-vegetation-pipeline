export const grassFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 verticalColorTransition;
  uniform vec3 distanceColorFarTint;
  uniform vec2 distanceColorRange;
  uniform float distanceColorCurveStrength;
  uniform float directLightWeight;

  flat in vec3 bladeBottomColor;
  flat in vec3 bladeTopColor;
  flat in vec3 groundNormalView;
  in vec3 vViewPosition;
  in float bladeHeightRatio;
  in float cameraDistanceMeters;

  #ifdef GROUND_COLOR_TRANSITION
    flat in vec2 groundColorProgress;
  #endif
  out vec4 outputColor;

  #define LAMBERT
  #define gl_FragColor outputColor
  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>

  struct GrassMaterial {
    vec3 diffuseColor;
  };

  float grassDirectLightWeight;

  // Direct light keeps its scene color, attenuation and shadows, but never uses
  // the incidental angle of the two-dimensional blade face.
  void RE_Direct_Grass(
    const in IncidentLight directLight,
    const in vec3 geometryPosition,
    const in vec3 geometryNormal,
    const in vec3 geometryViewDir,
    const in vec3 geometryClearcoatNormal,
    const in GrassMaterial material,
    inout ReflectedLight reflectedLight
  ) {
    float directIncidence = saturate(dot(geometryNormal, directLight.direction));
    reflectedLight.directDiffuse += directLight.color
      * directIncidence
      * grassDirectLightWeight
      * BRDF_Lambert(material.diffuseColor);
  }

  void RE_IndirectDiffuse_Grass(
    const in vec3 irradiance,
    const in vec3 geometryPosition,
    const in vec3 geometryNormal,
    const in vec3 geometryViewDir,
    const in vec3 geometryClearcoatNormal,
    const in GrassMaterial material,
    inout ReflectedLight reflectedLight
  ) {
    reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
  }

  #define RE_Direct RE_Direct_Grass
  #define RE_IndirectDiffuse RE_IndirectDiffuse_Grass

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
    grassDirectLightWeight = directLightWeight;
    #ifdef GROUND_COLOR_TRANSITION
      float groundLightingProgress = mix(
        groundColorProgress.x,
        groundColorProgress.y,
        colorTransition
      );
      grassDirectLightWeight = mix(directLightWeight, 1.0, groundLightingProgress);
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

    // Match the reconstructed ground slope, never the incidental blade face.
    vec3 normal = normalize(groundNormalView);
    GrassMaterial material;
    material.diffuseColor = grassColor;
    ReflectedLight reflectedLight = ReflectedLight(
      vec3(0.0),
      vec3(0.0),
      vec3(0.0),
      vec3(0.0)
    );
    #include <lights_fragment_begin>
    #include <lights_fragment_end>

    outputColor = vec4(
      reflectedLight.directDiffuse + reflectedLight.indirectDiffuse,
      1.0
    );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
