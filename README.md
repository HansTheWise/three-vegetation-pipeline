# three-vegetation-pipeline

A modular vegetation compilation and WebGL rendering pipeline for Three.js.
The generic runtime owns VEGFILE parsing, shared chunk visibility and GPU data.
Runtime profiles own profile-specific validation, preparation and rendering.

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
  createVegetationPipelineSetup,
  createWebGLGrassRuntimeProfile,
  grassPreset,
} from 'three-vegetation-pipeline'

const config = {
  configVersion: 3,
  layers: [grassPreset({
    vegetationLayerId: 0,
    vegetationLayerKey: 'meadow-grass',
    density: { renderTileSizeCells: 16 },
  })],
} as const

const pipelineSetup = createVegetationPipelineSetup({
  runtimeProfiles: [createWebGLGrassRuntimeProfile()],
})

const vegetation = await createThreeVegetationSceneBinding({
  renderer,
  scene,
  camera,
  vegetationParent: modelRoot,
  vegFileBytes: vegetationBytes,
  vegetationRuntimeConfig: config,
  pipelineSetup,
})

function frame() {
  vegetation.updateFrame()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

frame()
```

`grassPreset(...)` returns a complete Grass layer config. The Grass runtime
profile owns its dataset Worker, validation and WebGL renderer. A normal
consumer does not create a Worker entry or dataset adapter.

## Runtime profiles

A `VegetationRuntimeProfile` owns exactly one `renderProfile.type`, its WebGL
renderer factory and the Worker factory that prepares its runtime data. Built-in
and external profiles are passed through the same `runtimeProfiles` array.
Duplicate profile types are rejected.

Profiles in one setup must share one dataset-creation Worker factory. A profile
package therefore ships a Worker entry that registers the preparations for the
profiles it exposes. This keeps profile preparation off the UI thread without
duplicating VEGFILE parsing for each layer.

## Worker dataset creation

`createWebGLGrassRuntimeProfile()` references the pipeline-owned built-in Worker.
The Worker parses VEGFILE data and prepares every enabled Grass layer before the
runtime allocates WebGL resources. The adapter and transferable-buffer protocol
remain available from `three-vegetation-pipeline/runtime` for profile-package
authors, but they are not part of normal project integration.

External profile packages follow the same boundary: their exported runtime
profiles reference a package-owned Worker entry and consumers only import and
register those profiles.

## Package entry points

- `three-vegetation-pipeline`: supported application API
- `three-vegetation-pipeline/runtime`: lower-level runtime and preparation
- `three-vegetation-pipeline/webgl`: GPU and rendering contracts
- `three-vegetation-pipeline/profiles/grass`: Grass-specific APIs
- `three-vegetation-pipeline/debug`: optional debug tools
- `three-vegetation-pipeline/pre-runtime-compiler-core`: source-independent compiler core
- `three-vegetation-pipeline/node-pre-runtime-compiler-integration`: Node.js filesystem integration for the compiler core

## Architecture

- [Pre-runtime compiler core](src/pre-runtime-compiler-core/README.md)
- [Node.js compiler integration](src/node-pre-runtime-compiler-integration/README.md)
- [Runtime](src/runtime/README.md)
- [Grass profile](src/layer-profiles/grass/grass-webgl-rendering/README.md)
- [Optional debug tools](src/debug/README.md)
- [WebGL runtime example](examples/webgl-runtime.html)
- [WebGL tile-submission benchmark](benchmarks/webgl-render-tile-submission.html)
- [Completed first refactor pass](CLEANUP_REFACTOR_PLAN.md)
- [Future decision order](IMPLEMENTATION_ROADMAP.md)
