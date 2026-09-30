# GLB model reading

`GlbArrayBufferModelReader` converts an already loaded GLB `ArrayBuffer` into
vegetation-independent triangle data.

```text
GLB ArrayBuffer -> GlbArrayBufferModelReader -> ModelData
```

It loads the GLB with Three.js, traverses included meshes, transforms vertex
positions into the supplied model root's local space, separates material
groups, and records model bounds.

`GlbModelReadingConfig.includeInvisibleObjects` controls whether invisible
objects are included. Instanced meshes, skinned meshes, and active morph
targets are rejected because their additional transformations would otherwise
be lost.

```ts
new GlbArrayBufferModelReader(config).readModelData(glbArrayBuffer): Promise<ModelData>
new GlbArrayBufferModelReader(config).readModelDataFromRoot(modelRoot): ModelData
```

`ModelData` contains no vegetation layers, chunks, height maps, or VEGFILE
encoding details.
