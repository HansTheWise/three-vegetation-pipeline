# Runtime-Dataset

`createVegetationRuntimeDataset` verbindet das rendererunabhängige
Parserergebnis strikt über stabile Layer-IDs mit der Runtime-Config:

```text
ParsedVegFile + VegetationRuntimeConfig
                  |
                  v
        VegetationRuntimeDataset
                  |
                  +-> CPU-Sichtbarkeit und Tile-Dichte
                  +-> WebGL-Adapter
                  +-> späterer WebGPU-Adapter
```

Jede Layer-ID muss genau einmal im VEGFILE und genau einmal in der Config
vorkommen. Eine Runtime-Layer referenziert die Binärdaten und Config, enthält
die einmalig erzeugten maximalen Patterns, das optionale globale Patch-Feld und
die aus Chunk- und Maskenauflösung abgeleitete Cell-Größe. Das Patch-Feld wird
nur für aktivierte Layer mit `patches.enabled: true` angelegt. Kameraabhängige
Dichtebudgets gehören nicht in das Dataset und werden deshalb nicht darin
dupliziert.
