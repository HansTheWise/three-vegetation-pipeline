# Implementation roadmap

Status: post-refactor baseline, 18 September 2026

## Current architecture

The offline pipeline reads model data, extracts renderer-neutral vegetation
data and writes VEGFILE v2. The runtime parses that file, selects configured
layers and delegates profile-specific work to explicit modules.

The generic runtime owns:

- VEGFILE v2 parsing and runtime dataset construction;
- stored-Chunk coordinates and coarse Frustum visibility;
- shared WebGL textures and changed-selection uploads;
- layer lifecycle and profile-neutral diagnostics;
- Three.js scene, camera and lighting integration.

The Grass profile owns:

- Grass config, validation and presets;
- active Cell preparation, patterns and density selection;
- optional ground patches and Clover rendering;
- Grass WebGL resources, fine tile culling and draw submission;
- Grass-specific debug views and counters.

## Public integration path

```text
grassPreset
  + createWebGLGrassLayerModule
  + createThreeVegetationSceneBinding
```

Grass is never registered by the generic runtime. Other render profiles can
implement the same `WebGLVegetationLayerModule` contract with their own config,
preparation and renderer.

Optional diagnostics are imported separately:

```text
three-vegetation-pipeline/debug
```

## Future decision order

No follow-up implementation is active. When new work is requested, use this
order:

1. Resolve the deferred offline-config and `sourceBounds` decisions if they
   become relevant.
2. Profile the WebGL runtime and change it only against a measurable target.
3. Add or improve renderer profiles through the existing module contract.
4. Consider a WebGPU backend only when its expected benefit and supported
   device scope are defined.

Each new design change requires discussion and explicit approval before
implementation.
