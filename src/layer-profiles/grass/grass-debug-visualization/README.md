# Grass Debug Visualization

This optional module diagnoses the Grass profile without adding debug resources
to the normal vegetation runtime.

`WebGLGrassDebug` combines the shared camera, Frustum, Chunk-outline and GPU
timing utilities with Grass-specific counters and controls. The host calls the
camera update before runtime culling, records its measured vegetation CPU time,
and wraps exactly one render call with the GPU measurement methods.

`WebGLGrassChunkCellDebugView` renders a heightmap-following surface for every
visible stored Chunk. It displays the original VEGFILE mask, Cell grid and the
deterministic Grass anchors. Its layer-mask texture is created and disposed only
by this debug view; it is not part of shared runtime resources.

```ts
import { WebGLGrassDebug } from 'three-vegetation-pipeline/debug';

const grassDebug = new WebGLGrassDebug({
  sharedResources,
  grassRenderer,
  camera,
  scene,
  panelParent,
});

grassDebug.updateCameraController(deltaSeconds);
vegetationSceneBinding.updateFrame(grassDebug.cullingCamera);
grassDebug.recordFrameDiagnostics(deltaSeconds, vegetationCpuMilliseconds);
grassDebug.beginGpuFrameMeasurement();
renderer.render(scene, camera);
grassDebug.endGpuFrameMeasurement();
```

The host must call `dispose()` before disposing the Grass renderer or shared
WebGL resources. The German panel labels are presentation text; module names,
exports and documentation remain English.
