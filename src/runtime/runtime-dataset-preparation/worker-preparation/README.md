# Runtime preparation

Preparation parses VEGFILE bytes and builds a renderer-independent runtime
dataset.

```text
bytes -> VEGFILE v2 parser -> enabled layer selection -> profile preparation
```

`SynchronousVegetationPreparation` runs this flow on the calling thread.
`WorkerVegetationPreparation` transfers a copy of the source buffer so the
consumer's original buffer remains usable.

Both paths require explicit profile preparations. A worker entry must register
the same profile preparations itself because module functions cannot cross the
worker boundary. Only shared arrays and buffers reported by prepared profiles
are transferred back.
