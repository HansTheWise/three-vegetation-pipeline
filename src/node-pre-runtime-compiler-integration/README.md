# Node.js pre-runtime compiler integration

The `three-vegetation-pipeline/node-pre-runtime-compiler-integration` entry
point connects local files to the source-independent pre-runtime compiler
core.

```text
source GLB path
  -> NodeGlbFileSource.readGlbArrayBuffer
  -> GLB ArrayBuffer
  -> CompileGlbToVegFileManager from pre-runtime-compiler-core
  -> VEGFILE bytes
  -> writeVegFileAtomically
```

- `NodeGlbFileSource` resolves and reads a local `.glb` as an `ArrayBuffer`.
- `generateNodeVegFile` uses the compiler core and atomically replaces the
  requested `.veg` file.
- `checkVegFileBuildStatus` loads optional local VEGFILE bytes and delegates
  all validation and comparison to the compiler core.

File paths remain outside `VegetationCompilerConfig`. Browser and network
integrations load their own GLB `ArrayBuffer` and pass it directly to the
source-independent compiler core.

## Module hierarchy

| Module | Responsibility |
|---|---|
| `NodeVegFileGenerationManager.ts` | Root orchestration for local generation |
| [glb-file-source](./glb-file-source/README.md) | Read a local GLB into an `ArrayBuffer` |
| [veg-file-output](./veg-file-output/README.md) | Persist complete VEGFILE bytes atomically |
| [veg-file-build-status](./veg-file-build-status/README.md) | Load local status inputs and invoke the core status manager |
| [file-path-validation](./file-path-validation/README.md) | Resolve and validate local input and output paths |
