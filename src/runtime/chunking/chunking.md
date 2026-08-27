# Chunk-Frustum-Culling

Das Chunking-Modul erzeugt einmalig modelllokale Begrenzungsboxen für die
Vegetations-Chunks aus einem validierten `ParsedVegFile`. Anschließend prüft es
diese Boxen pro Frame gegen den sichtbaren Bereich der Kamera, das Frustum.

```text
ParsedVegFile -> createChunkBoundingBoxes
                         + projection * view * model
                         -> FrustumChunkVisibility.updateVisibleChunks
                         -> visibleChunkIndices + visibleChunkCount
```

Die Begrenzungsboxen sind reine Zahlendaten und keine Three.js-Objekte. Ihre
horizontale Ausdehnung stammt aus Grid-Ursprung, Gridposition und Chunkgröße;
die vertikale Ausdehnung aus `chunkHeightRanges`. Das Padding wird in Metern
über die Konstanten am Anfang von `ChunkBoundingBoxes.ts` eingestellt und über
`unitsPerMeter` in Modellkoordinaten übersetzt.

`FrustumChunkVisibility.updateVisibleChunks` erhält eine spaltenweise gespeicherte
kombinierte Matrix `projection * view * model`. Dadurch dürfen die `.veg`-Daten
im lokalen Modellraum bleiben. Der Aufrufer muss außerdem den Tiefenraum angeben:

- `negative-one-to-one` für einen Clip-Space mit Z von -1 bis 1;
- `zero-to-one` für einen Clip-Space mit Z von 0 bis 1.

`visibleChunkIndices` wird beim Erzeugen von `FrustumChunkVisibility` einmalig
angelegt. Pro Frame werden nur seine ersten `visibleChunkCount` Einträge
überschrieben; die Sichtbarkeitsprüfung selbst erzeugt keine neuen Arrays oder
Objekte.

Das Modul prüft ausschließlich das Kamera-Frustum. Distanz-, LOD- und
Occlusion-Culling bleiben getrennte spätere Schritte.
