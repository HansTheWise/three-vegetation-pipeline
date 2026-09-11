# three-vegetation-pipeline

A modular, data-driven vegetation rendering pipeline for Three.js, designed for GPU-driven placement, chunking, LOD, and interchangeable rendering strategies.

## Installation

```sh
npm install three-vegetation-pipeline three
npm install --save-dev @types/three
```

The package is ESM-only. The compiler CLI requires Node.js 22.18 or newer.

## Three.js quickstart

```ts
import {
  createThreeVegetationSystem,
  grassPreset,
} from 'three-vegetation-pipeline'

const system = createThreeVegetationSystem({
  renderer,
  scene,
  camera,
  coordinateRoot: modelRoot,
})

const vegetation = await system.create({
  source: vegetationBytes,
  layers: [
    grassPreset({
      layerId: 0,
      key: 'meadow-grass',
      density: { renderTileSizeCells: 16 },
      lighting: { directLightWeight: 0.6 },
    }),
  ],
})

function frame() {
  vegetation.updateFrame()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

vegetation.setLayerEnabled('meadow-grass', false)
vegetation.dispose()
```

The system creates the standard scene and camera adapters. Grass materials use
the renderer's normal Three.js scene-light, incoming-shadow, tone-mapping,
exposure, and output-color paths. No separate light or exposure bridge is
required.

`grassPreset(...)` always returns a complete Grass layer. Nested values passed
to the preset replace only those values; the remaining defaults stay intact.

## Custom layer modules

`registerLayerModule(...)` is the router-like extension point. One module owns
one `renderProfile.type` and may provide its own config validation, CPU
preparation, transferable buffers, prepared-data validation, and WebGL renderer.
Only the layer identity, enabled state, conservative culling bounds, and profile
type are generic requirements.

```ts
system.registerLayerModule(treeModule)

const vegetation = await system.create({
  source: vegetationBytes,
  layers: [treeLayer],
})
```

The built-in Grass module is registered automatically. Registering a custom
module with `profileType: 'grass'` replaces its preparation and renderer for new
vegetation instances.

## Worker preparation

The built-in Grass preparation can run in a bundler-owned module worker:

```ts
// vegetation.worker.ts
import {
  installVegetationPreparationWorker,
  type VegetationPreparationWorkerScope,
} from 'three-vegetation-pipeline'

installVegetationPreparationWorker(
  self as unknown as VegetationPreparationWorkerScope,
)
```

Custom modules with CPU preparation must also register that preparation in the
worker entry. The main-thread renderer registration cannot cross the worker
boundary automatically.

## Package entry points

- `three-vegetation-pipeline`: supported quickstart API;
- `three-vegetation-pipeline/runtime`: lower-level runtime and preparation;
- `three-vegetation-pipeline/webgl`: renderer, GPU, and shader contracts;
- `three-vegetation-pipeline/profiles/grass`: complete Grass preset and features;
- `three-vegetation-pipeline/debug`: optional debug tools;
- `three-vegetation-pipeline/node`: Node.js compiler API.

The `veg-compile` CLI accepts JavaScript configs and erasable TypeScript configs.
Node.js does not read `tsconfig.json` for direct TypeScript execution, so enums,
path aliases, and syntax requiring transformation are not supported there.

## Architecture

- [Cleanup and refactor plan](CLEANUP_REFACTOR_PLAN.md)
- [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)
- [Offline pipeline](src/offline/offline-pipeline.md)
- [Runtime pipeline](src/runtime/runtime-pipeline.md)
- [Grass patch-field contract](src/runtime/profiles/grass/patches/patches.md)
- [Standalone WebGL runtime example](examples/webgl-runtime.html)
- [Low-level WebGL debug example](examples/webgl-debug-chunks.html)
