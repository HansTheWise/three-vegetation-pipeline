# Grass WebGL rendering

`createWebGLGrassLayerModule()` is the explicit Grass integration. It combines
Grass validation and preparation with `WebGLGrassLayerRenderer`; the generic runtime
does not import or register it automatically.

## Frame work

```text
visible stored chunks
  -> mask-active render tiles
  -> tile frustum culling
  -> distance-based Cell, Anchor and Element budgets
  -> smallest sufficient candidate-capacity bucket
  -> Grass draws
```

`WebGLGrassLayerRenderer` uses one compact visible Render Tile texture. Power-of-two candidate
buckets bound padding below two times the visible candidate count without
compacting every candidate on the CPU. Static pattern, palette, patch and
optional Clover resources belong to the Grass layer and are disposed with it.

Each candidate-capacity bucket owns one Mesh below a shared layer Group. The
renderer skips tile selection when the camera state and visible stored-chunk
selection are unchanged.

`GrassBladeGeometry` builds the blade strip, `GrassShaderMaterial` binds the
prepared layer and shared VEGFILE textures, and `WebGLGrassLayerResources`
owns immutable profile textures. These helpers contain no frame orchestration.

## Options

- `grassLightingMaterialFactory` replaces material creation while leaving
  Grass placement and density unchanged. Its contract is documented under
  [Grass project integration](../../../runtime/project-integration/layer-profile-integration/grass/lighting-material/README.md).
- `groundPatchSurface` optionally projects the prepared patch field onto
  consumer-selected Three.js ground materials through the
  [ground-patch integration](../../../runtime/project-integration/layer-profile-integration/grass/ground-patch-material/README.md).

The default Three.js material factory preserves scene lights, incoming shadows,
tone mapping and renderer output color processing.
