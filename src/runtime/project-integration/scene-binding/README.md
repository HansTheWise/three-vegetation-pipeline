# Three.js scene binding

This profile-independent module connects the WebGL vegetation runtime to a
consumer-owned Three.js scene, camera and renderer. It does not select or
configure a vegetation profile.

## Data flow

```text
Three.js Camera
  -> ThreeCameraFrameStateAdapter
  -> VegetationFrameState in vegetation model space
  -> VegetationRuntimeManager.updateFrame
```

`createThreeVegetationSceneBinding(...)` is the single high-level entry point.
It creates the runtime, attaches its `object3d` to `vegetationParent` (or the
scene), forwards frame updates and owns cleanup. Calling `destroy()` detaches
the object hierarchy and permanently destroys the completed runtime; internal
Three.js and WebGL resources are released through their native `dispose()`
contracts.

## Scene graph integration

The pipeline extends the consumer's existing Three.js scene graph with normal
Three.js objects. It does not run a separate render pass or submit independent
draw calls:

```text
Scene or vegetationParent
  -> vegetation runtime Group
     -> one Group per prepared vegetation layer
        -> profile-owned renderable objects
           -> Grass Mesh instances with InstancedBufferGeometry and ShaderMaterial
```

A `Group` is a non-renderable `Object3D` container. The runtime Group applies a
shared transform and lifetime to all vegetation. Each layer Group controls the
transform and visibility of one layer. Only renderable descendants such as the
Grass `Mesh` objects produce draw calls.

The VEGFILE already contains the model-space masks, height data and coordinate
system created during pre-runtime compilation. The scene reference is therefore
used to attach the vegetation hierarchy, not to project or reconstruct masks at
runtime. `ThreeCameraFrameStateAdapter` combines the camera matrices with the
vegetation root transform so culling and LOD stay in the same model space.

## Frame update and rendering ownership

The consumer owns the animation loop and calls the vegetation update before the
normal Three.js render:

```text
ThreeVegetationSceneBinding.updateFrame(camera)
  -> camera and vegetation transform -> VegetationFrameState
  -> chunk visibility, profile culling and LOD
  -> changed texture data and Mesh instance counts

WebGLRenderer.render(scene, camera)
  -> traverses the same scene graph
  -> finds the vegetation Mesh objects
  -> binds their geometry, materials, textures, lights and shadows
  -> submits WebGL draw calls
```

The pipeline creates and updates Three.js GPU-resource descriptions such as
`DataTexture`, `InstancedBufferGeometry` and `ShaderMaterial`. It may ask the
provided `WebGLRenderer` to initialize changed textures eagerly, but it does not
issue raw WebGL draw calls. Three.js owns shader compilation, resource binding,
scene-light collection and command submission to WebGL.

## Required configuration

- `vegFileBytes` and `vegetationRuntimeConfig` select the data and configured layers.
- `pipelineSetup` contains every explicitly selected runtime profile and its
  Worker-backed dataset preparation.
- `vegetationParent` controls the scene attachment point.
- `frameStateProvider` is an optional replacement boundary.
- `cancellationSignal` cancels runtime creation when the requesting scene lifecycle ends.

No profile, including Grass, is registered automatically. Built-in and external
profiles use the same setup contract.
