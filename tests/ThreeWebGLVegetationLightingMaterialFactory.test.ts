import { DoubleSide, GLSL3 } from 'three';
import { describe, expect, it } from 'vitest';

import { createThreeWebGLVegetationLightingMaterialFactory } from '../src/index.js';

describe('ThreeWebGLVegetationLightingMaterialFactory', () => {
  it('connects vegetation shaders to native Three.js lighting and output processing', () => {
    const materialFactory = createThreeWebGLVegetationLightingMaterialFactory();
    const material = materialFactory.createVegetationLightingMaterial({
      name: 'test/vegetation-lighting',
      vertexShader: `
        #include <vegetation_lighting_pars_vertex>
        void main() {
          #include <vegetation_shadowmap_vertex>
        }
      `,
      fragmentShader: `
        #include <vegetation_lighting_pars_fragment>
        void main() {
          #include <vegetation_lighting_fragment>
          #include <vegetation_tonemapping_fragment>
          #include <vegetation_colorspace_fragment>
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
    expect(material.fragmentShader).not.toContain('#include <vegetation_');
  });

  it('rejects vegetation markers it cannot implement', () => {
    const materialFactory = createThreeWebGLVegetationLightingMaterialFactory();

    expect(() => materialFactory.createVegetationLightingMaterial({
      name: 'test/unsupported-marker',
      vertexShader: 'void main() {}',
      fragmentShader: '#include <vegetation_unknown_fragment>',
      side: DoubleSide,
      uniforms: {},
    })).toThrow('unsupported lighting material marker');
  });
});
