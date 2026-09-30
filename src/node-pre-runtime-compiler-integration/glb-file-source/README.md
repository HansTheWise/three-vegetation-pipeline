# Node.js GLB file source

`NodeGlbFileSource` resolves and reads a local `.glb` file into an
`ArrayBuffer`.

```text
local GLB path -> NodeGlbFileSource -> ArrayBuffer
```

It owns Node.js filesystem access only. `NodeVegFileGenerationManager`
explicitly passes the returned `ArrayBuffer` to the compiler core, where the
GLB container is validated before model reading begins.
