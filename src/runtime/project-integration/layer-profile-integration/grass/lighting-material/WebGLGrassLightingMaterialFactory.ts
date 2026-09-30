import type { IUniform, ShaderMaterial, Side } from 'three';

export type WebGLGrassLightingMaterialOptions = Readonly<{
  name: string;
  vertexShader: string;
  fragmentShader: string;
  side: Side;
  defines?: Readonly<Record<string, unknown>>;
  uniforms: Readonly<Record<string, IUniform>>;
}>;

/** Creates one Grass material connected to a WebGL lighting implementation. */
export interface WebGLGrassLightingMaterialFactory {
  createGrassLightingMaterial(
    options: WebGLGrassLightingMaterialOptions,
  ): ShaderMaterial;
}
