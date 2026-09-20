# Runtime Debug Visualization

This module contains optional diagnostics that do not depend on a vegetation
renderer profile:

- `CameraFrustumVisualization` displays a frozen culling camera;
- `createStoredChunkCullingBoundsOutlines` displays shared stored-Chunk bounds;
- `FirstPersonCameraController` provides pointer-lock inspection controls;
- `WebGLGpuFrameTimer` collects asynchronous WebGL2 timer-query results.

The module owns only the debug objects it creates. The host still owns the
camera, renderer, scene and render loop. Profile-specific views belong to the
profile that supplies their resources and counters.

All public debug utilities are available through
`three-vegetation-pipeline/debug`; the normal runtime entry points do not load
them.
