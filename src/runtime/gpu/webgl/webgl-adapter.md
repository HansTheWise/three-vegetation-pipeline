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
- normalisierte Pattern-Anker pro konfigurierter Vegetationsschicht: `RG32F`.

Die Texturbreite der Heightmap entspricht `valuesPerChunk`, ihre Höhe der
Anzahl gespeicherter Chunks. Bei Masken entspricht die Breite
`maskWordsPerChunk`. Alle anderen statischen Texturen sowie der sichtbare
Chunkspeicher verwenden aktuell eine Zeile mit einem Texel pro Chunk.
Die Patterntextur verwendet einen Anker pro Spalte und ein Pattern pro Zeile.
Sie wird aus VEGFILE-Seed und Runtime-Config erzeugt und ebenfalls nur einmal
hochgeladen.

`WebGLVisibleChunkBuffer` reserviert beim Erzeugen Platz für alle gespeicherten
Chunks. `update` überschreibt nur das vorhandene `Uint32Array`; es wird kein
neuer Speicher pro Frame angelegt. `dispose` gibt alle Three.js-Texturen wieder
frei.
