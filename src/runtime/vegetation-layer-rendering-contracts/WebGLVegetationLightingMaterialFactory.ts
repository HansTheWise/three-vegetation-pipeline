import type { IUniform, ShaderMaterial, Side } from 'three';

export type WebGLVegetationLightingMaterialOptions = Readonly<{
  name: string;
  vertexShader: string;
  fragmentShader: string;
  side: Side;
  defines?: Readonly<Record<string, unknown>>;
  uniforms: Readonly<Record<string, IUniform>>;
}>;

/** Creates a vegetation material connected to one WebGL lighting implementation. */
export interface WebGLVegetationLightingMaterialFactory {
  createVegetationLightingMaterial(
    options: WebGLVegetationLightingMaterialOptions,
  ): ShaderMaterial;
}
