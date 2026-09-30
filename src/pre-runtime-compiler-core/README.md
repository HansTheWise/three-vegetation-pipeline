# Pre-runtime compiler core

The pre-runtime compiler validates caller-provided GLB bytes and converts them
into VEGFILE-v2 bytes. It creates no runtime or GPU resources and performs no
direct filesystem access.

## Data flow

```text
GLB ArrayBuffer
  -> validateGlbArrayBuffer
  -> GlbArrayBufferModelReader
  -> ModelData
  -> VegetationExtractorManager
  -> VegetationDataset
  -> writeVegFile
  -> VEGFILE-v2 Uint8Array
```

`compileGlbToVegFile` validates the complete `VegetationCompilerConfig`,
resolves the default vegetation seed, and passes explicitly typed results
through those stages in order.

The separate build-status flow accepts already loaded GLB and optional VEGFILE
bytes. `VegFileBuildStatusManager` validates them, calculates the expected
fingerprint, and reports whether compilation is required without extracting
model geometry.

## Architecture convention

The compiler uses hierarchical pipeline orchestration. A manager exposes the
linear data flow for one responsibility and delegates detailed work to child
managers or leaf modules. Readers can therefore follow the complete workflow
at the top level and descend only into the stage they need to inspect.

- A manager coordinates at least two meaningful steps; it does not contain a
  detailed algorithm.
- Intermediate values are named and explicitly typed at manager boundaries.
- Dependencies flow downward. Child modules do not know their manager.
- Platform-specific loading stays outside source-independent compiler logic
  and passes a concrete `ArrayBuffer` across the core boundary.
- Configuration is grouped by the module that consumes it. File paths are not
  compiler configuration.
- A leaf operation remains a function or focused class instead of receiving a
  decorative manager layer.

## Module ownership

| Module | Responsibility |
|---|---|
| [configuration](./configuration/README.md) | Public module-specific config, validation, and defaults |
| [glb-array-buffer-validation](./glb-array-buffer-validation/README.md) | Validate the caller-provided GLB container |
| [glb-model-reading](./glb-model-reading/README.md) | Convert GLB content into neutral `ModelData` |
| [veg-file-build-status](./veg-file-build-status/README.md) | Compare loaded GLB/config provenance with optional VEGFILE bytes |
| [vegetation-dataset-extraction](./vegetation-dataset-extraction/README.md) | Produce chunk height maps and layer masks |
| [vegetation-dataset-validation](./vegetation-dataset-validation/README.md) | Validate the extracted dataset before encoding |
| [veg-file-writing](./veg-file-writing/README.md) | Encode a validated dataset as VEGFILE v2 |

## Public boundaries

- `ArrayBuffer` is the complete, source-independent GLB input boundary.
- `validateGlbArrayBuffer` checks the GLB container before model reading.
- `evaluateVegFileBuildStatus` owns source-independent status semantics.
- `ModelData` is independent of vegetation layers and VEGFILE encoding.
- `VegetationDataset` is an internal stage result and is not returned by
  `compileGlbToVegFile`.
- `Uint8Array` contains the complete VEGFILE-v2 output.
- Local path handling is available from
  `three-vegetation-pipeline/node-pre-runtime-compiler-integration` and remains
  outside this source-independent compiler core.

VEGFILE v2 still stores complete model source bounds. Removing that field
requires a binary format revision and asset regeneration.
