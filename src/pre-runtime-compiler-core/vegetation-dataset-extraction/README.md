# Vegetation dataset extraction

`VegetationExtractorManager` is the orchestration layer for converting neutral
`ModelData` into a file-format-independent `VegetationDataset`.

```text
ModelData + VegetationExtractionConfig
  -> ModelTriangleSelection
  -> ExtractionChunkGrid
  -> StoredVegetationChunkExtraction
       -> VegetationMaskExtraction
       -> ChunkHeightMapExtraction
  -> VegetationDataset
```

The manager shows only the ordered data flow. Each subordinate module owns one
specific transformation and exposes a named result to the next stage.

## Module responsibilities

- [model-triangle-selection](./model-triangle-selection/README.md) maps model
  axes and selects height, vegetation, and exclusion triangles.
- [extraction-grid-construction](./extraction-grid-construction/README.md)
  creates the logical chunk grid and partitions selected triangles into it.
- [stored-chunk-extraction](./stored-chunk-extraction/README.md) coordinates
  per-chunk mask and height extraction and keeps only chunks containing
  vegetation.
- [vegetation-mask-extraction](./vegetation-mask-extraction/README.md)
  rasterizes vegetation and exclusion masks and checks layer overlap.
- [chunk-heightmap-extraction](./chunk-heightmap-extraction/README.md) samples
  unquantized surface heights for one stored chunk.

Chunks without active vegetation cells are omitted. `chunkLookup` maps every
logical grid position either to `-1` or to a compact stored-chunk index.

The extractor does not quantize heights, pack masks, or write VEGFILE bytes.
Those responsibilities belong to `VegFileWriter`.
