# Extractor

Der Extractor wandelt neutrale Modelldaten anhand der Pipeline-Config in ein dateiformatunabhängiges `VegetationDataset` um.

```text
ModelData + Config -> VegetationExtractor -> VegetationDataset
```

## Aufgabe

- Konfigurierte Höhen- und Horizontalachsen auswerten.
- Height-Surfaces und Vegetationsflächen über Mesh- und Materialnamen auswählen.
- Das Modell in ein festes logisches Chunk-Grid einteilen.
- Nur Chunks speichern, die mindestens eine aktive Vegetationszelle enthalten.
- Pro gespeichertem Chunk eine Heightmap erzeugen.
- Pro Layer eine eigene Vegetationsmaske in dessen konfigurierter `maskResolution` erzeugen.
- Steigungsfilter und die erlaubte Layer-Überlappung prüfen.
- Den manuellen oder einmalig generierten Seed in das Dataset übernehmen.

## Dataset-Aufbau

```text
VegetationDataset
├── Koordinatensystem und Modellgrenzen
├── Seed
├── Chunk-Grid
├── ChunkLookup
├── Chunk-Metadaten mit Min-/Max-Höhe
├── unquantisierte HeightData
└── Layer[] mit eigener Auflösung und logischen 0/1-Maskenzellen
```

Der `ChunkLookup` enthält für jede Position im logischen Grid entweder `-1` oder den Index des gespeicherten Chunks.

Heightmap-Daten werden chunkweise gespeichert:

```text
heightOffset = storedChunkIndex * heightResolution²
```

Maskendaten liegen ebenfalls chunkweise innerhalb des jeweiligen Layers:

```text
maskOffset = storedChunkIndex * layer.maskResolution²
```

Der Extractor quantisiert und packt keine Daten. Diese dateispezifischen Aufgaben übernimmt der Writer.

## Heightmap-Semantik in v1

Die einfache Heightmap ist ein bewusster v1-Kompromiss:

- Treffen mehrere Höhenflächen dasselbe Sample, wird die höchste Höhe verwendet.
- Samples ohne direkten Treffer werden vom nächsten vorhandenen Sample aus aufgefüllt.
- Überhänge und mehrere vertikale Ebenen werden nicht getrennt repräsentiert.

Damit bleibt jeder horizontale Punkt genau einer Höhe zugeordnet. Modelle, die
mehrere begehbare Ebenen an derselben horizontalen Position benötigen, brauchen
später einen erweiterten Extraktionsvertrag.
