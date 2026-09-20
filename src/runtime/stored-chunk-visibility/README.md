# Chunk-Frustum-Culling

Das Chunking-Modul erzeugt einmalig modelllokale Begrenzungsboxen für die
Vegetations-Chunks aus einem validierten `ParsedVegFile`. Anschließend prüft es
diese Boxen pro Frame gegen den sichtbaren Bereich der Kamera, das Frustum.

```text
VegetationRuntimeDataset -> createRuntimeStoredChunkCullingBounds
                                      + projection * view * model
                                      -> FrustumStoredChunkVisibility.updateVisibleStoredChunks
                                      -> visibleStoredChunkIndices + visibleStoredChunkCount
```

Die Begrenzungsboxen sind reine Zahlendaten und keine Three.js-Objekte. Ihre
horizontale Ausdehnung stammt aus Grid-Ursprung, Gridposition und Chunkgröße;
die vertikale Ausdehnung aus `chunkHeightRanges`. Die Gridpositionen stammen
aus der einmalig im Dataset erzeugten Rückwärtszuordnung
`storedChunkGridCoordinates`; das Culling durchsucht `chunkLookup` nicht erneut.
Das Padding wird in Metern
vom profilspezifisch berechneten `VegetationLayerCullingBounds`-Vertrag
geliefert und über `unitsPerMeter` in
Modellkoordinaten übersetzt. Das Dataset kombiniert dafür die größten Bounds
der aktivierten Layer. So bleibt der grobe Chunk-Pass einmalig und konservativ,
auch wenn beispielsweise Grass und deutlich höhere Bäume dieselben Chunks
verwenden.

`FrustumStoredChunkVisibility.updateVisibleStoredChunks` erhält eine spaltenweise gespeicherte
kombinierte Matrix `projection * view * model`. Dadurch dürfen die `.veg`-Daten
im lokalen Modellraum bleiben. Der Aufrufer muss außerdem den Tiefenraum angeben:

- `negative-one-to-one` für einen Clip-Space mit Z von -1 bis 1;
- `zero-to-one` für einen Clip-Space mit Z von 0 bis 1.

`visibleStoredChunkIndices` wird beim Erzeugen von
`FrustumStoredChunkVisibility` einmalig angelegt. Pro Frame werden nur seine
ersten `visibleStoredChunkCount` Einträge
überschrieben; die Sichtbarkeitsprüfung selbst erzeugt keine neuen Arrays oder
Objekte.

Das Modul prüft ausschließlich das Kamera-Frustum. Distanzdichte und
Occlusion-Culling bleiben getrennte Schritte. Das anschließende Tile-Culling
verwendet dieselbe Bounds-Struktur, dort jedoch mit den Werten des konkreten
Layers.
