# Debug tools

This module owns optional inspection and diagnostic features. It is outside the
production runtime and layer-profile modules and is available only through
`three-vegetation-pipeline/debug`.

## Modules

- [Runtime inspection](./runtime-inspection/README.md) provides shared camera,
  stored-Chunk outline, navigation and GPU-timing tools.
- [Grass layer inspection](./grass-layer-inspection/README.md) provides
  Grass-specific masks, Cell and Pattern visualization, counters and controls.

## Dependency boundary

Debug modules may inspect runtime and layer-profile objects. Runtime and
layer-profile modules must not import from this directory. The host owns the
scene, camera, renderer and render loop and explicitly creates any diagnostics
it needs.
