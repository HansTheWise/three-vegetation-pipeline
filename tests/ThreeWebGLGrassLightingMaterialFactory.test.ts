import { DoubleSide, GLSL3 } from 'three';
import { describe, expect, it } from 'vitest';

import { createThreeWebGLGrassLightingMaterialFactory } from '../src/package-entrypoints/InternalDevelopmentApi.js';

describe('ThreeWebGLGrassLightingMaterialFactory', () => {
  it('connects Grass shaders to native Three.js lighting and output processing', () => {
    const materialFactory = createThreeWebGLGrassLightingMaterialFactory();
    const material = materialFactory.createGrassLightingMaterial({
      name: 'test/vegetation-lighting',
      vertexShader: `
        #include <grass_lighting_pars_vertex>
        void main() {
          #include <grass_shadowmap_vertex>
        }
      `,
      fragmentShader: `
        #include <grass_lighting_pars_fragment>
        void main() {
          #include <grass_lighting_fragment>
          #include <grass_tonemapping_fragment>
          #include <grass_colorspace_fragment>
        }
      `,
      side: DoubleSide,
      uniforms: { customValue: { value: 42 } },
    });

    expect(material.name).toBe('test/vegetation-lighting');
    expect(material.glslVersion).toBe(GLSL3);
    expect(material.lights).toBe(true);
    expect(material.toneMapped).toBe(true);
    expect(material.uniforms.customValue!.value).toBe(42);
    expect(material.uniforms.ambientLightColor).toBeDefined();
    expect(material.uniforms.directionalLights).toBeDefined();
    expect(material.vertexShader).toContain('#include <shadowmap_pars_vertex>');
    expect(material.vertexShader).toContain('#include <shadowmap_vertex>');
    expect(material.fragmentShader).toContain('#include <lights_pars_begin>');
    expect(material.fragmentShader).toContain('#include <shadowmap_pars_fragment>');
    expect(material.fragmentShader).toContain('RE_Direct_Vegetation');
    expect(material.fragmentShader).toContain('* vegetationDirectLightWeight');
    expect(material.fragmentShader).toContain('* vegetationIndirectLightWeight');
    expect(material.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(material.fragmentShader).toContain('#include <tonemapping_fragment>');
    expect(material.fragmentShader).toContain('#include <colorspace_fragment>');
    expect(material.fragmentShader).not.toContain('#include <grass_');
  });

  it('rejects Grass markers it cannot implement', () => {
    const materialFactory = createThreeWebGLGrassLightingMaterialFactory();

    expect(() => materialFactory.createGrassLightingMaterial({
      name: 'test/unsupported-marker',
      vertexShader: 'void main() {}',
      fragmentShader: '#include <grass_unknown_fragment>',
      side: DoubleSide,
      uniforms: {},
    })).toThrow('unsupported lighting material marker');
  });
});
