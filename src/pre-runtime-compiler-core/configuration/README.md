# Compiler configuration

`VegetationCompilerConfig` groups settings by the module that consumes them:

- `glbModelReading` configures `GlbArrayBufferModelReader`.
- `extraction` configures vegetation dataset extraction, including the model
  coordinate system, deterministic seed, chunk grid, height map, and layers.
- `vegFileEncoding` configures VEGFILE binary encoding.

Validation covers the complete object before GLB parsing begins. A missing
`extraction.vegetationSeed` resolves to `0`; supplying the same seed always
produces the same deterministic extraction result for identical input and
configuration.

Paths are intentionally absent. The source-independent compiler receives a
complete GLB `ArrayBuffer`; the Node.js integration owns local input and output
paths.
