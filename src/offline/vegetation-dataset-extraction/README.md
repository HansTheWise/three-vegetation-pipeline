# Vegetationsextraktion

Der Extractor wandelt neutrale Modelldreiecke und die Offline-Config in ein
dateiformatunabhängiges `VegetationDataset` um.

```text
ModelData + VegetationExtractionConfig
                  ↓
          VegetationDataset
```

## Ablauf

1. Hierarchie- und Materialselektoren ordnen Dreiecke den Höhenflächen,
   Vegetationslayern und optionalen Ausschlussflächen zu.
2. Die konfigurierten Modellachsen werden auf zwei horizontale Koordinaten und
   eine Höhe abgebildet.
3. Die Höhenflächen bestimmen das logische Chunk-Grid.
4. Dreiecke werden vor der Rasterung auf die überlappten Chunks verteilt.
5. Jeder Layer erhält pro gespeicherten Chunk eine binäre Vegetationsmaske.
6. Jeder gespeicherte Chunk erhält eine unquantisierte Heightmap.

Chunks ohne aktive Vegetationszellen werden nicht gespeichert. `chunkLookup`
ordnet deshalb jede logische Gridposition entweder `-1` oder einem kompakten
`storedChunkIndex` zu.

`sourceBounds` erhält die vollständigen modelllokalen Grenzen der eingelesenen
Geometrie. VEGFILE v2 speichert dieses Feld weiterhin, die aktuelle Runtime
verwendet es jedoch nicht. Eine Entfernung ist deshalb eine gesonderte
Formatentscheidung und keine Aufgabe des Extractors.

## Interne Module

- `ModelTriangleSelection`: Selektoren, Achsenabbildung und Steigungsfilter.
- `ExtractionChunkGrid`: Gridgrenzen und räumliche Dreiecks-Bins.
- `VegetationMaskExtraction`: Maskenrasterung, Ausschlüsse und Layerüberlappung.
- `ChunkHeightMapExtraction`: Höhensampling und Auffüllen fehlender Samples.
- `ExtractionGeometry`: gemeinsame Dreiecks- und Clippingberechnungen.
- `VegetationExtractor`: koordiniert diese Schritte und baut das Dataset auf.

## Wichtige Configwerte

- `coordinateSystem`: Höhenachse, horizontale Achsen und Modelleingaben pro Meter.
- `source.heightSurfaceSelector`: Flächen, aus denen Grid und Heightmaps entstehen.
- `extraction.grid.chunkSize`: horizontale Größe eines Chunks in Modelleinheiten.
- `extraction.heightMap.resolution`: Samples pro Chunkachse.
- `vegetationMask.allowLayerOverlap`: erlaubt oder verbietet überlappende Layerzellen.
- `vegetationLayers[]`: stabile ID, Diagnose-Key, Maskenauflösung,
  Flächen-/Ausschlussselektoren und maximale Steigung.

Ein Layer steht genau dann in der Offline-Config, wenn er in die VEGFILE-Datei
kompiliert werden soll. Laufzeitaktivierung gehört ausschließlich zur Runtime.

## Heightmap-Semantik

Jeder gespeicherte Chunk besitzt `resolution²` feste Samplepositionen. Schneiden
mehrere Höhenflächen dieselbe Position, gewinnt die höchste Höhe. Fehlende
Positionen werden deterministisch vom nächsten vorhandenen Sample aufgefüllt.

Sehr schmale Dreiecke können einen Chunk schneiden, ohne eine feste
Sampleposition zu treffen. Nur wenn der gesamte Chunk noch keinen gültigen
Samplewert besitzt, wird deshalb ein Punkt aus der tatsächlich überlappten
Dreiecksfläche als Startwert verwendet.

Das aktuelle Dataset speichert pro horizontaler Position nur eine Höhe. Überhänge oder
mehrere begehbare Ebenen an derselben Position werden nicht getrennt abgebildet.

## Dataset-Layout

```text
heightData:
storedChunkIndex * heightResolution² + sampleIndex

layer.maskData:
storedChunkIndex * layer.maskResolution² + cellIndex
```

Der Extractor quantisiert oder packt keine Daten. Das übernimmt ausschließlich
der Writer.
