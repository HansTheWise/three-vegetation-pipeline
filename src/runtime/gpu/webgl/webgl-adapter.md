# WebGL-GPU-Adapter

Der WebGL-Adapter trennt unveränderliche VEGFILE-Daten von der pro Frame
aktualisierten Liste sichtbarer Chunks.

```text
VegetationRuntimeDataset -> WebGLStaticVegetationResources -> einmaliger GPU-Upload

visibleChunkIndices + visibleChunkCount
               -> WebGLVisibleChunkBuffer       -> Upload pro Änderung
```

Die statischen Daten liegen in `DataTexture`-Ressourcen:

- gespeicherter Chunkindex zu zweidimensionaler Gridkoordinate: `RG32UI`;
- minimale und maximale Chunkhöhe: `RG32F`;
- quantisierte Heightmap: `R8UI`, `R16UI` oder `R32UI`;
- bitgepackte Maske pro Vegetationsschicht: `R32UI`.

Die Texturbreite der Heightmap entspricht `valuesPerChunk`, ihre Höhe der
Anzahl gespeicherter Chunks. Bei Masken entspricht die Breite
`maskWordsPerChunk`. Alle anderen statischen Texturen sowie der sichtbare
Chunkspeicher verwenden aktuell eine Zeile mit einem Texel pro Chunk.

Pattern, Farbpaletten, Patchfelder, Geometry und Material sind keine
gemeinsamen VEGFILE-Ressourcen. Sie gehören dem jeweiligen Layer-Renderer und
werden von diesem erzeugt und freigegeben. Dadurch kann ein anderes
Renderprofil den gemeinsamen Adapter verwenden, ohne Grass-Ressourcen
anzulegen.

`WebGLVisibleChunkBuffer` reserviert beim Erzeugen Platz für alle gespeicherten
Chunks. `update` überschreibt nur das vorhandene `Uint32Array`; es wird kein
neuer Speicher pro Frame angelegt. `dispose` gibt alle Three.js-Texturen wieder
frei. Die Initialisierung ist transaktional: Schlägt ein späterer Textur-Upload
fehl, werden auch bereits hochgeladene Ressourcen derselben Erzeugung wieder
freigegeben.
