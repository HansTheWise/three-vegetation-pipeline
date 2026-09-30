import {
  GLSL3,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';

import type {
  WebGLGrassLightingMaterialFactory,
  WebGLGrassLightingMaterialOptions,
} from './WebGLGrassLightingMaterialFactory.js';

const THREE_SHADER_CHUNKS_BY_GRASS_MARKER = new Map<string, string>([
  ['#include <grass_lighting_pars_vertex>', /* glsl */ `
    #define HAS_NORMAL
    #include <common>
    #include <shadowmap_pars_vertex>
  `],
  ['#include <grass_shadowmap_vertex>', '#include <shadowmap_vertex>'],
  ['#include <grass_lighting_pars_fragment>', /* glsl */ `
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
  ['#include <grass_lighting_fragment>', /* glsl */ `
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
  ['#include <grass_tonemapping_fragment>', '#include <tonemapping_fragment>'],
  ['#include <grass_colorspace_fragment>', '#include <colorspace_fragment>'],
]);

/** Creates Grass materials using Three.js lights, shadows and color output. */
export class ThreeWebGLGrassLightingMaterialFactory
implements WebGLGrassLightingMaterialFactory {
  createGrassLightingMaterial(
    options: WebGLGrassLightingMaterialOptions,
  ): ShaderMaterial {
    return new ShaderMaterial({
      name: options.name,
      glslVersion: GLSL3,
      lights: true,
      vertexShader: replaceGrassLightingMarkersWithThreeShaderChunks(options.vertexShader),
      fragmentShader: replaceGrassLightingMarkersWithThreeShaderChunks(options.fragmentShader),
      side: options.side,
      ...(options.defines ? { defines: options.defines } : {}),
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.lights),
        ...options.uniforms,
      },
    });
  }
}

export function createThreeWebGLGrassLightingMaterialFactory():
ThreeWebGLGrassLightingMaterialFactory {
  return new ThreeWebGLGrassLightingMaterialFactory();
}

function replaceGrassLightingMarkersWithThreeShaderChunks(source: string): string {
  let sourceWithThreeShaderChunks = source;
  for (const [grassMarker, threeShaderChunks] of THREE_SHADER_CHUNKS_BY_GRASS_MARKER) {
    sourceWithThreeShaderChunks = sourceWithThreeShaderChunks.replaceAll(
      grassMarker,
      threeShaderChunks,
    );
  }
  if (sourceWithThreeShaderChunks.includes('#include <grass_')) {
    throw new Error('Grass shader contains an unsupported lighting material marker.');
  }
  return sourceWithThreeShaderChunks;
}
