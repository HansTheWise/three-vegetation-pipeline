import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Uint16BufferAttribute,
} from 'three';
import { describe, expect, it } from 'vitest';
import { ThreeGlbReader } from '../src/offline/reader/ThreeGlbReader.js';
import { createMinimalGlb } from './fixtures/createMinimalGlb.js';

describe('ThreeGlbReader', () => {
  it('returns vertices relative to the GLB root', () => {
    const root = new Group();
    root.name = 'campus';
    root.position.set(100, 200, 300);

    const surface = new Group();
    surface.name = 'surface';
    surface.position.set(10, 20, 30);
    root.add(surface);

    const mesh = createTriangleMesh('ground', 'map_grun');
    mesh.position.set(1, 2, 3);
    surface.add(mesh);

    const result = new ThreeGlbReader().readObject(root);

    expect(result.coordinateSpace).toBe('model-local');
    expect(result.sourceMeshCount).toBe(1);
    expect(result.triangleCount).toBe(1);
    expect(result.primitives).toHaveLength(1);
    expect([...result.primitives[0]!.positions]).toEqual([
      11, 22, 33,
      12, 22, 33,
      11, 23, 33,
    ]);
    expect(result.primitives[0]!.hierarchyNames).toEqual([
      'campus',
      'surface',
      'ground',
    ]);
    expect(result.primitives[0]!.materialName).toBe('map_grun');
    expect(result.bounds).toEqual({
      minX: 11,
      minY: 22,
      minZ: 33,
      maxX: 12,
      maxY: 23,
      maxZ: 33,
    });
  });

  it('keeps material groups as separate primitives', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ], 3));
    geometry.setIndex(new Uint16BufferAttribute([0, 1, 2, 0, 2, 3], 1));
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);

    const grass = new MeshBasicMaterial();
    grass.name = 'map_grun';
    const path = new MeshBasicMaterial();
    path.name = 'path';
    const mesh = new Mesh(geometry, [grass, path]);
    mesh.name = 'surface';

    const result = new ThreeGlbReader().readObject(mesh);

    expect(result.primitives.map((primitive) => primitive.materialName)).toEqual([
      'map_grun',
      'path',
    ]);
    expect([...result.primitives[0]!.indices]).toEqual([0, 1, 2]);
    expect([...result.primitives[1]!.indices]).toEqual([0, 2, 3]);
    expect(result.primitives[0]!.positions).toBe(result.primitives[1]!.positions);
    expect(result.triangleCount).toBe(2);
  });

  it('skips invisible objects unless explicitly included', () => {
    const root = new Group();
    const hidden = createTriangleMesh('hidden', 'map_grun');
    hidden.visible = false;
    root.add(hidden);

    expect(new ThreeGlbReader().readObject(root).primitives).toHaveLength(0);
    expect(new ThreeGlbReader({ includeInvisibleObjects: true })
      .readObject(root).primitives).toHaveLength(1);
  });

  it('parses a GLB ArrayBuffer through GLTFLoader', async () => {
    const result = await new ThreeGlbReader().read(createMinimalGlb());

    expect(result.primitives).toHaveLength(1);
    expect(result.primitives[0]!.meshName).toBe('surfice');
    expect(result.primitives[0]!.materialName).toBe('map_grun');
    expect([...result.primitives[0]!.indices]).toEqual([0, 1, 2]);
    expect([...result.primitives[0]!.positions]).toEqual([
      10, 20, 30,
      11, 20, 30,
      10, 21, 30,
    ]);
  });

  it('rejects instanced meshes instead of silently ignoring instance transforms', () => {
    const source = createTriangleMesh('trees', 'leaves');
    const instanced = new InstancedMesh(source.geometry, source.material, 2);
    instanced.name = 'trees';

    expect(() => new ThreeGlbReader().readObject(instanced))
      .toThrow('Instanced mesh "trees" is not supported.');
  });
});

function createTriangleMesh(meshName: string, materialName: string): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  const material = new MeshBasicMaterial();
  material.name = materialName;
  const mesh = new Mesh(geometry, material);
  mesh.name = meshName;
  return mesh;
}
