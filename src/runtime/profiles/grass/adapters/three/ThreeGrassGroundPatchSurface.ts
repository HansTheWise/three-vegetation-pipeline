import {
  Color,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Vector2,
  type Material,
  type Object3D,
} from 'three';

import type { Axis } from '../../../../../offline/config/types.js';
import type {
  WebGLGrassGroundPatchSurface,
  WebGLGrassGroundPatchSurfaceContext,
} from '../../rendering/webgl/WebGLGrassGroundPatchSurface.js';

type MaterialShader = Parameters<Material['onBeforeCompile']>[0];

export type ThreeGrassGroundPatchSurfaceOptions = Readonly<{
  coordinateRoot: Object3D;
  matchesMaterial(object: Mesh, material: Material): boolean;
}>;

/** Projects the Grass patch field onto selected Three.js Lambert/Standard materials. */
export class ThreeGrassGroundPatchSurface implements WebGLGrassGroundPatchSurface {
  readonly #coordinateRoot: Object3D;
  readonly #matchesMaterial: ThreeGrassGroundPatchSurfaceOptions['matchesMaterial'];

  constructor(options: ThreeGrassGroundPatchSurfaceOptions) {
    this.#coordinateRoot = options.coordinateRoot;
    this.#matchesMaterial = options.matchesMaterial;
  }

  install(context: WebGLGrassGroundPatchSurfaceContext): () => void {
    const restores: Array<() => void> = [];
    const patchedMaterials = new Set<Material>();
    try {
      this.#coordinateRoot.updateWorldMatrix(true, true);
      const modelFromWorld = this.#coordinateRoot.matrixWorld.clone().invert();
      this.#coordinateRoot.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!this.#matchesMaterial(object, material)) continue;
          if (!(material instanceof MeshStandardMaterial
            || material instanceof MeshLambertMaterial)) {
            throw new Error(
              `Grass ground patches require a Lambert or Standard material, received ${material.type}.`,
            );
          }
          if (patchedMaterials.has(material)) {
            throw new Error('A Grass ground-patch material must not be shared by multiple meshes.');
          }
          patchedMaterials.add(material);
          restores.push(patchMaterial(
            material,
            context,
            modelFromWorld.clone().multiply(object.matrixWorld),
          ));
        }
      });
    } catch (error) {
      restoreInReverse(restores);
      throw error;
    }
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      restoreInReverse(restores);
    };
  }
}

export function createThreeGrassGroundPatchSurface(
  options: ThreeGrassGroundPatchSurfaceOptions,
): ThreeGrassGroundPatchSurface {
  return new ThreeGrassGroundPatchSurface(options);
}

function patchMaterial(
  material: MeshLambertMaterial | MeshStandardMaterial,
  context: WebGLGrassGroundPatchSurfaceContext,
  modelFromObject: Matrix4,
): () => void {
  const { field, texture } = context;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  const baseColor = new Color(field.baseColor);
  const origin = new Vector2(field.originX, field.originY);
  const extent = new Vector2(
    field.width * field.texelSizeUnits,
    field.height * field.texelSizeUnits,
  );
  const horizontalAxes = context.dataset.file.header.coordinateSystem.horizontalAxes;

  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.vegetationGrassPatchField = { value: texture };
    shader.uniforms.vegetationGrassPatchBaseColor = { value: baseColor };
    shader.uniforms.vegetationGrassPatchBrightnessVariation = {
      value: field.brightnessVariation,
    };
    shader.uniforms.vegetationGrassPatchOrigin = { value: origin };
    shader.uniforms.vegetationGrassPatchExtent = { value: extent };
    shader.uniforms.vegetationGrassPatchModelFromObject = { value: modelFromObject };
    patchShader(shader, horizontalAxes);
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    return `${previousCacheKey.call(this)}|three-vegetation-grass-ground-patch-v1`;
  };
  material.needsUpdate = true;

  return () => {
    material.onBeforeCompile = previousCompile;
    material.customProgramCacheKey = previousCacheKey;
    material.needsUpdate = true;
    material.dispose();
  };
}

function patchShader(shader: MaterialShader, horizontalAxes: readonly [Axis, Axis]): void {
  const position = `vec2(vegetationGrassPatchModelPosition.${axisComponent(horizontalAxes[0])}, vegetationGrassPatchModelPosition.${axisComponent(horizontalAxes[1])})`;
  assertShaderChunk(shader.vertexShader, '#include <common>');
  assertShaderChunk(shader.vertexShader, '#include <begin_vertex>');
  assertShaderChunk(shader.fragmentShader, '#include <common>');
  assertShaderChunk(shader.fragmentShader, '#include <map_fragment>');
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
uniform mat4 vegetationGrassPatchModelFromObject;
varying vec2 vegetationGrassPatchPosition;`,
  ).replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
vec3 vegetationGrassPatchModelPosition = (vegetationGrassPatchModelFromObject * vec4(position, 1.0)).xyz;
vegetationGrassPatchPosition = ${position};`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
uniform sampler2D vegetationGrassPatchField;
uniform vec3 vegetationGrassPatchBaseColor;
uniform float vegetationGrassPatchBrightnessVariation;
uniform vec2 vegetationGrassPatchOrigin;
uniform vec2 vegetationGrassPatchExtent;
varying vec2 vegetationGrassPatchPosition;`,
  ).replace(
    '#include <map_fragment>',
    `#include <map_fragment>
vec2 vegetationGrassPatchUv = (vegetationGrassPatchPosition - vegetationGrassPatchOrigin)
  / vegetationGrassPatchExtent;
vec2 vegetationGrassPatchValue = texture2D(vegetationGrassPatchField, vegetationGrassPatchUv).rg;
float vegetationGrassPatchInBounds = step(0.0, vegetationGrassPatchUv.x)
  * step(0.0, vegetationGrassPatchUv.y)
  * step(vegetationGrassPatchUv.x, 1.0)
  * step(vegetationGrassPatchUv.y, 1.0);
float vegetationGrassPatchBrightness = 1.0 + vegetationGrassPatchBrightnessVariation
  * vegetationGrassPatchValue.r
  * vegetationGrassPatchInBounds
  * (vegetationGrassPatchValue.g * 2.0 - 1.0);
diffuseColor.rgb = clamp(
  vegetationGrassPatchBaseColor * vegetationGrassPatchBrightness,
  vec3(0.0),
  vec3(1.0)
);`,
  );
}

function axisComponent(axis: Axis): 'x' | 'y' | 'z' {
  return axis;
}

function assertShaderChunk(shader: string, chunk: string): void {
  if (!shader.includes(chunk)) {
    throw new Error(`Grass ground patches require Three.js shader chunk ${chunk}.`);
  }
}

function restoreInReverse(restores: readonly (() => void)[]): void {
  for (let index = restores.length - 1; index >= 0; index -= 1) restores[index]!();
}
