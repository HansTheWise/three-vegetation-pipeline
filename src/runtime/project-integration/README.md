# Consumer project integration

This module contains the runtime boundary between a consumer's Three.js project
and the vegetation pipeline. Internal culling, GPU resources and profile
algorithms remain with their owning runtime or layer-profile modules.

## Integration hierarchy

```text
consumer Three.js project
  -> scene binding
     -> Scene, Camera and WebGLRenderer
     -> VegetationRuntimeManager
  -> layer-profile integration
     -> profile-specific lighting and consumer-material hooks
```

## Modules

- [Scene binding](./scene-binding/README.md) attaches the vegetation hierarchy
  and converts camera state for each requested frame update.
- [Layer-profile integration](./layer-profile-integration/README.md) contains
  project-facing hooks required by specific render profiles.

Dataset creation adapters remain in `dataset-preparation` because they select
the CPU execution environment rather than integrating scene data or materials.
