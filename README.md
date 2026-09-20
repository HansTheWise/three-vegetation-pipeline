# three-vegetation-pipeline

A modular vegetation compilation and WebGL rendering pipeline for Three.js.
The generic runtime owns VEGFILE parsing, shared chunk visibility and GPU data.
Layer modules own profile-specific validation, preparation and rendering.

## Installation

```sh
npm install three-vegetation-pipeline three
npm install --save-dev @types/three
```

The package is ESM-only. The compiler CLI requires Node.js 22.18 or newer.

## Three.js quickstart

Grass is an opt-in preset, not a runtime default:

```ts
import {
  createThreeVegetationSceneBinding,
  createWebGLGrassLayerModule,
  grassPreset,
} from 'three-vegetation-pipeline'

const config = {
  configVersion: 3,
  layers: [grassPreset({
    layerId: 0,
    key: 'meadow-grass',
    density: { renderTileSizeCells: 16 },
  })],
} as const

const vegetation = await createThreeVegetationSceneBinding({
  renderer,
  scene,
  camera,
  vegetationParent: modelRoot,
  source: vegetationBytes,
  config,
  layerModules: [createWebGLGrassLayerModule()],
})

function frame() {
  vegetation.updateFrame()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

frame()
```

`grassPreset(...)` returns a complete Grass layer config. The Grass module adds
its validator, CPU preparation and WebGL renderer as one explicit dependency.

## Custom layer modules

A `WebGLVegetationLayerModule` owns exactly one `renderProfile.type` and supplies
its preparation and renderer. Pass every required module through
`layerModules`; duplicate profile types are rejected.

The generic runtime knows only layer identity, enablement, culling bounds and
the module selection key. It does not import Grass or another concrete profile.

## Worker preparation

Workers must register the same profile preparations explicitly:

```ts
import {
  grassLayerPreparation,
  installVegetationPreparationWorker,
  type VegetationPreparationWorkerScope,
} from 'three-vegetation-pipeline'

installVegetationPreparationWorker(
  self as unknown as VegetationPreparationWorkerScope,
  { layerPreparations: [grassLayerPreparation] },
)
```

The worker receives preparation functions from its own entry file; functions
cannot be transferred from the main thread.

## Package entry points

- `three-vegetation-pipeline`: supported application API
- `three-vegetation-pipeline/runtime`: lower-level runtime and preparation
- `three-vegetation-pipeline/webgl`: GPU and rendering contracts
- `three-vegetation-pipeline/profiles/grass`: Grass-specific APIs
- `three-vegetation-pipeline/debug`: optional debug tools
- `three-vegetation-pipeline/node`: Node.js compiler API

## Architecture

- [Offline pipeline](src/offline/offline-pipeline.md)
- [Runtime pipeline](src/runtime/runtime-pipeline.md)
- [Grass profile](src/layer-profiles/grass/grass-webgl-rendering/README.md)
- [Optional debug tools](src/runtime/runtime-debug-visualization/README.md)
- [WebGL runtime example](examples/webgl-runtime.html)
- [WebGL tile-submission benchmark](benchmarks/webgl-render-tile-submission.html)
- [Completed first refactor pass](CLEANUP_REFACTOR_PLAN.md)
- [Future decision order](IMPLEMENTATION_ROADMAP.md)
