# Runtime

The runtime parses VEGFILE v2 data, prepares only configured and enabled
layers, uploads shared GPU data and delegates profile-specific work to explicit
runtime profiles.

## Initialization flow

```text
selected runtime profiles
  -> VegetationPipelineSetup validates profile types and Worker compatibility
VEGFILE v2 bytes + runtime config + pipeline setup
  -> VegetationRuntimeManager calls the setup's Worker-backed dataset creation
     -> VegFileDatasetCreationManager
        -> VEGFILE v2 parsing
        -> vegetation dataset creation
  -> validate runtime-profile renderer registry
  -> ChunkVisibilityManager
     -> visible stored-chunk texture
  -> WebGLVegetationLayerManager
     -> immutable dataset textures
     -> profile renderers
  -> Three.js scene binding
```

## Modules

| Order | Module | Responsibility |
|---:|---|---|
| 1 | [VEGFILE parsing](../shared/vegfile-parsing/README.md) | Validate current-format bytes and expose typed-array views |
| 2 | [Dataset preparation](./dataset-preparation/dataset-construction/README.md) | Join file layers to enabled config layers |
| 3 | [Layer profile preparation](./dataset-preparation/layer-profile-preparation/README.md) | Run profile-owned validation and CPU preparation |
| 4 | [Chunk visibility management](./chunk-visibility-management/README.md) | Own shared frustum culling and its mutable visibility texture |
| 5 | [Layer management](./vegetation-layer-management/README.md) | Own immutable dataset textures, layer renderers and runtime-to-profile contracts |
| 6 | [WebGL data-texture layout](./webgl-data-texture-layout/README.md) | Pack linear typed arrays into supported texture dimensions |
| 7 | [Consumer project integration](./project-integration/README.md) | Bind scene and camera plus profile-specific project materials |

Optional diagnostics live outside this production module under
[debug tools](../debug/README.md) and are exposed only through
`three-vegetation-pipeline/debug`.

## Per-frame flow

```text
ThreeCameraFrameStateAdapter
  -> VegetationRuntimeManager
     -> ChunkVisibilityManager
        -> shared stored-chunk frustum culling
        -> changed visible-chunk upload
     -> WebGLVegetationLayerManager
        -> profile-specific tile culling and density selection
  -> WebGL draws
```

## Contracts

- File layers without frontend config are ignored.
- Config layers with `enabled: false` are not prepared or uploaded.
- Static VEGFILE data and visible chunk indices are shared across profiles,
  but remain owned by their responsible manager.
- No profile is registered by default; consumers explicitly pass
  `createWebGLGrassRuntimeProfile()` through `createVegetationPipelineSetup()`.
- Runtime profiles own their dataset Worker boundary; consumer projects do not
  create Worker entries or dataset adapters.
