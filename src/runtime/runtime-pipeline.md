# Runtime pipeline

The runtime parses VEGFILE v2 data, prepares only configured and enabled
layers, uploads shared GPU data and delegates profile-specific work to explicit
layer modules.

## Initialization flow

```text
VEGFILE v2 bytes + runtime config + layer modules
  -> VEGFILE v2 parsing
  -> runtime dataset preparation
  -> shared WebGL resources
  -> profile renderers
  -> Three.js scene binding
```

## Modules

| Order | Module | Responsibility |
|---:|---|---|
| 1 | [VEGFILE v2 parsing](./vegfile-v2-parsing/README.md) | Validate v2 bytes and expose typed-array views |
| 2 | [Runtime dataset preparation](./runtime-dataset-preparation/dataset-construction/README.md) | Join file layers to enabled config layers |
| 3 | [Layer profile preparation](./runtime-dataset-preparation/layer-profile-preparation/README.md) | Run profile-owned validation and CPU preparation |
| 4 | [Stored chunk visibility](./stored-chunk-visibility/README.md) | Build chunk coordinates and perform shared frustum culling |
| 5 | [WebGL resource management](./webgl-vegetation-resource-management/README.md) | Own static textures and mutable visibility buffers |
| 6 | [Layer rendering contracts](./vegetation-layer-rendering-contracts/README.md) | Define the runtime-to-profile boundary |
| 7 | [Runtime orchestration](./vegetation-runtime-orchestration/README.md) | Update shared visibility and enabled renderers |
| 8 | [Three.js integration](./threejs-runtime-integration/README.md) | Bind camera, scene, lighting materials and cleanup |

Optional diagnostics are isolated from this production path:

- [Runtime debug visualization](./runtime-debug-visualization/README.md) contains
  profile-independent camera, Chunk-bound and GPU-timing tools.
- [Grass debug visualization](../layer-profiles/grass/grass-debug-visualization/README.md)
  owns Grass masks, Cell/Pattern inspection and Grass counters.
- Both are exposed only through `three-vegetation-pipeline/debug`.

## Per-frame flow

```text
ThreeCameraFrameStateAdapter
  -> shared stored-chunk frustum culling
  -> changed visible-chunk upload
  -> profile-specific tile culling and density selection
  -> WebGL draws
```

## Contracts

- File layers without frontend config are ignored.
- Config layers with `enabled: false` are not prepared or uploaded.
- `setLayerEnabled` toggles only layers prepared during runtime creation.
- Static VEGFILE data and visible chunk indices are shared across profiles.
- No profile is registered by default; Grass uses
  `createWebGLGrassLayerModule()` explicitly.
