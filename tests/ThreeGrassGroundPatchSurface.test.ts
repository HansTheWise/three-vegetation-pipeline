import {
  DataTexture,
  Group,
  Matrix4,
  Material,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RGFormat,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createThreeGrassGroundPatchSurface,
  type GrassGroundPatchField,
  type GrassRuntimeLayer,
  type VegetationRuntimeDataset,
} from '../src/index.js';

const field: GrassGroundPatchField = {
  layerId: 0,
  data: Uint8Array.of(0, 128, 255, 200, 255, 64, 128, 128),
  width: 2,
  height: 2,
  texelSizeUnits: 4,
  texelSizeMeters: 4,
  originX: -4,
  originY: 12,
  baseColor: '#39a83a',
  brightnessVariation: 0.2,
  patchCount: 1,
  eligibleSampleCount: 4,
  achievedCoverage: 0.5,
};

describe('ThreeGrassGroundPatchSurface', () => {
  it('patches selected materials with dataset axes and restores their hooks', () => {
    const root = new Group();
    root.position.set(100, 0, 200);
    const selected = new MeshLambertMaterial();
    selected.name = 'selected-ground';
    const untouched = new MeshLambertMaterial();
    untouched.name = 'road';
    const selectedMesh = new Mesh(new PlaneGeometry(), selected);
    selectedMesh.position.x = 5;
    root.add(selectedMesh, new Mesh(new PlaneGeometry(), untouched));
    const originalCompile = selected.onBeforeCompile;
    const originalUntouchedCompile = untouched.onBeforeCompile;
    const texture = new DataTexture(field.data, 2, 2, RGFormat);
    const materialDispose = vi.spyOn(selected, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const surface = createThreeGrassGroundPatchSurface({
      coordinateRoot: root,
      matchesMaterial: (_object, material) => material.name === 'selected-ground',
    });

    const restore = surface.install(createContext(texture));

    expect(untouched.onBeforeCompile).toBe(originalUntouchedCompile);
    const shader = createShader();
    selected.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.uniforms.vegetationGrassPatchField!.value).toBe(texture);
    expect(shader.uniforms.vegetationGrassPatchModelFromObject!.value)
      .toEqual(expect.any(Matrix4));
    expect(shader.vertexShader).toContain('vegetationGrassPatchModelPosition.z');
    expect(shader.vertexShader).toContain('vegetationGrassPatchModelPosition.x');
    expect(shader.fragmentShader).toContain('vegetationGrassPatchValue.r');
    expect(shader.fragmentShader).toContain('vegetationGrassPatchValue.g * 2.0 - 1.0');

    restore();
    restore();
    expect(selected.onBeforeCompile).toBe(originalCompile);
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).not.toHaveBeenCalled();
  });

  it('rejects selected materials that cannot host the Grass feature', () => {
    const root = new Group();
    const unsupported = new Material();
    unsupported.name = 'selected-ground';
    root.add(new Mesh(new PlaneGeometry(), unsupported));
    const surface = createThreeGrassGroundPatchSurface({
      coordinateRoot: root,
      matchesMaterial: () => true,
    });

    expect(() => surface.install(createContext(new DataTexture())))
      .toThrow('require a Lambert or Standard material');
  });
});

function createContext(texture: DataTexture) {
  return {
    dataset: {
      file: { header: { coordinateSystem: { horizontalAxes: ['z', 'x'] } } },
    } as unknown as VegetationRuntimeDataset,
    layer: {
      profileData: { groundPatchField: field },
    } as GrassRuntimeLayer,
    field,
    texture,
  } as const;
}

function createShader(): Parameters<Material['onBeforeCompile']>[0] {
  return {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>',
  } as Parameters<Material['onBeforeCompile']>[0];
}
