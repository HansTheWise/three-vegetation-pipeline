# WebGL vegetation layer management

`createValidatedWebGLVegetationLayerRendererRegistry` validates the explicitly
supplied runtime-profile renderer factories before any GPU resource is allocated.
`WebGLVegetationLayerManager` then creates the immutable
`WebGLVegetationDatasetTextures` and one renderer for every prepared layer. It
owns their update, toggle, diagnostics, and disposal lifecycle.

The manager also owns the renderer, renderer-factory, creation-context,
and diagnostics contracts implemented by layer profiles. Keeping these types
with their consumer makes the runtime-to-profile boundary visible at the point
where it is enforced.

```text
PreparedVegetationDataset + runtime-profile renderer factories
  -> validated renderer registry
PreparedVegetationDataset + WebGLRenderer + visible stored-chunk texture
  -> create immutable dataset textures
  -> create prepared layer renderers
  -> WebGLVegetationLayerManager
```

Each renderer receives the renderer, prepared dataset, immutable dataset
textures, mutable visible-chunk texture, and its prepared layer explicitly.
The manager does not hide those dependencies behind a shared resource owner.
Profile-specific resources and diagnostics remain inside the individual layer
renderers.
