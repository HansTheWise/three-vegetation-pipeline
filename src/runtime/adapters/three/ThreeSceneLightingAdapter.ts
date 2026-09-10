import {
  GLSL3,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';

import type {
  WebGLVegetationLightingAdapter,
  WebGLVegetationLitMaterialOptions,
} from '../../rendering/webgl/WebGLVegetationLightingAdapter.js';

const shaderChunks = new Map<string, string>([
  ['#include <vegetation_lighting_pars_vertex>', /* glsl */ `
    #define HAS_NORMAL
    #include <common>
    #include <shadowmap_pars_vertex>
  `],
  ['#include <vegetation_shadowmap_vertex>', '#include <shadowmap_vertex>'],
  ['#include <vegetation_lighting_pars_fragment>', /* glsl */ `
    #define LAMBERT
    #define gl_FragColor outputColor
    #include <common>
    #include <packing>
    #include <bsdfs>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>

    struct VegetationMaterial {
      vec3 diffuseColor;
    };

    float vegetationDirectLightWeight;
    float vegetationIndirectLightWeight;

    void RE_Direct_Vegetation(
      const in IncidentLight directLight,
      const in vec3 geometryPosition,
      const in vec3 geometryNormal,
      const in vec3 geometryViewDir,
      const in vec3 geometryClearcoatNormal,
      const in VegetationMaterial material,
      inout ReflectedLight reflectedLight
    ) {
      float directIncidence = saturate(dot(geometryNormal, directLight.direction));
      reflectedLight.directDiffuse += directLight.color
        * directIncidence
        * vegetationDirectLightWeight
        * BRDF_Lambert(material.diffuseColor);
    }

    void RE_IndirectDiffuse_Vegetation(
      const in vec3 irradiance,
      const in vec3 geometryPosition,
      const in vec3 geometryNormal,
      const in vec3 geometryViewDir,
      const in vec3 geometryClearcoatNormal,
      const in VegetationMaterial material,
      inout ReflectedLight reflectedLight
    ) {
      reflectedLight.indirectDiffuse += irradiance
        * vegetationIndirectLightWeight
        * BRDF_Lambert(material.diffuseColor);
    }

    #define RE_Direct RE_Direct_Vegetation
    #define RE_IndirectDiffuse RE_IndirectDiffuse_Vegetation
  `],
  ['#include <vegetation_lighting_fragment>', /* glsl */ `
    VegetationMaterial material;
    material.diffuseColor = vegetationDiffuseColor;
    ReflectedLight reflectedLight = ReflectedLight(
      vec3(0.0),
      vec3(0.0),
      vec3(0.0),
      vec3(0.0)
    );
    vec3 normal = vegetationLightingNormal;
    #include <lights_fragment_begin>
    #include <lights_fragment_end>

    outputColor = vec4(
      reflectedLight.directDiffuse + reflectedLight.indirectDiffuse,
      1.0
    );
  `],
  ['#include <vegetation_tonemapping_fragment>', '#include <tonemapping_fragment>'],
  ['#include <vegetation_colorspace_fragment>', '#include <colorspace_fragment>'],
]);

/** Uses Three.js scene lights, shadows, tone mapping, exposure and output color space. */
export class ThreeSceneLightingAdapter implements WebGLVegetationLightingAdapter {
  createMaterial(options: WebGLVegetationLitMaterialOptions): ShaderMaterial {
    return new ShaderMaterial({
      name: options.name,
      glslVersion: GLSL3,
      lights: true,
      vertexShader: injectThreeShaderChunks(options.vertexShader),
      fragmentShader: injectThreeShaderChunks(options.fragmentShader),
      side: options.side,
      ...(options.defines ? { defines: options.defines } : {}),
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.lights),
        ...options.uniforms,
      },
    });
  }
}

export function createThreeSceneLightingAdapter(): ThreeSceneLightingAdapter {
  return new ThreeSceneLightingAdapter();
}

function injectThreeShaderChunks(source: string): string {
  let result = source;
  for (const [marker, chunks] of shaderChunks) {
    result = result.replaceAll(marker, chunks);
  }
  if (result.includes('#include <vegetation_')) {
    throw new Error('Vegetation shader contains an unsupported lighting adapter marker.');
  }
  return result;
}
