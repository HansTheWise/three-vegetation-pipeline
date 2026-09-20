# Three.js runtime integration

This module connects the generic WebGL vegetation runtime to a Three.js scene.
It does not select a vegetation profile.

## Data flow

```text
Three.js Camera
  -> ThreeCameraFrameStateAdapter
  -> VegetationFrameState in vegetation model space
  -> WebGLVegetationRuntime.updateFrame
```

`createThreeVegetationSceneBinding(...)` is the single high-level entry point.
It creates the runtime, attaches its `object3d` to `vegetationParent` (or the
scene), forwards frame updates and owns cleanup.

`ThreeWebGLVegetationLightingMaterialFactory` connects vegetation shader
markers to Three.js lights, incoming shadows, tone mapping and output color.
Layer modules may inject another material factory when required.

## Required configuration

- `source` and `config` select the data and configured layers.
- `layerModules` explicitly registers every used render profile.
- `vegetationParent` controls the scene attachment point.
- `preparation` and `frameStateProvider` are optional replacement boundaries.

No profile, including Grass, is registered automatically.
