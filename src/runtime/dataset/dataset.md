# Runtime-Dataset

`createVegetationRuntimeDataset` ist die einzige Verbindung zwischen dem
rendererunabhängigen Parserergebnis und der Runtime-Config:

```text
ParsedVegFile + VegetationRuntimeConfig
                  |
                  v
        VegetationRuntimeDataset
                  |
                  +-> CPU-Sichtbarkeit und LOD
                  +-> WebGL-Adapter
                  +-> späterer WebGPU-Adapter
```

Jede stabile Layer-ID muss genau einmal im VEGFILE und genau einmal in der
Runtime-Config vorkommen. Fehlende Zuordnungen werden beim Erstellen des
Datensatzes abgelehnt und können daher nicht erst im Shader auffallen.

Eine verbundene Runtime-Layer enthält Referenzen auf Binärdaten und Config,
ihre einmalig erzeugten Patterns sowie die aus Chunk- und Maskenauflösung
abgeleitete Cell-Größe in Modell- und Meter-Einheiten. Die Binärdaten werden
nicht kopiert.
