# WebGL vegetation resource management

This module owns only WebGL resources shared by the vegetation runtime.

```text
VegetationRuntimeDataset
  -> WebGLSharedVegFileTextures       immutable VEGFILE data
  -> WebGLVisibleStoredChunkTexture  current visible stored-chunk indices
```

`WebGLSharedVegFileTextures` uploads stored-chunk grid coordinates (`RG32UI`),
chunk height ranges (`RG32F`) and quantized height data (`R8UI`, `R16UI` or
`R32UI`) once. Layer masks are not shared runtime resources. A renderer profile
owns the masks it needs; the debug mask is created only by the debug view.

Linear texel sequences span as many rows as required. Layout validation uses
the renderer's real `MAX_TEXTURE_SIZE` limit instead of an arbitrary map-size
cap.

`WebGLVisibleStoredChunkTexture` reserves capacity once. Its `update` method
uploads only when the used index prefix changes. A count-only change needs no
upload because the draw count selects the valid prefix. `selectionRevision`
still changes for either kind of selection change so profile renderers can
skip unchanged CPU work safely.

`WebGLSharedVegetationResources.dispose()` releases both shared resource
groups. Construction cleans up completed uploads if a later upload fails.
