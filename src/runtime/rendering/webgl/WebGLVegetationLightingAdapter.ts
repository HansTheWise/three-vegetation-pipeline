import type { IUniform, ShaderMaterial, Side } from 'three';

export type WebGLVegetationLitMaterialOptions = Readonly<{
  name: string;
  vertexShader: string;
  fragmentShader: string;
  side: Side;
  defines?: Readonly<Record<string, unknown>>;
  uniforms: Readonly<Record<string, IUniform>>;
}>;

/** Connects vegetation shader inputs to one WebGL lighting implementation. */
export interface WebGLVegetationLightingAdapter {
  createMaterial(options: WebGLVegetationLitMaterialOptions): ShaderMaterial;
}
