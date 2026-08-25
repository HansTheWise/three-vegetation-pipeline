# Writer und VEGFILE v1

Der Writer kodiert ein neutrales `VegetationDataset` als binäre `.veg`-Datei.

```text
VegetationDataset + WriterConfig -> writeVegFile -> Uint8Array
```

Er validiert das Dataset, quantisiert Heightmaps mit den konfigurierten `8`, `16` oder `32` Bit und packt jeweils 32 Maskenzellen in ein `Uint32`. Das Schreiben auf die Festplatte gehört nicht zum Writer.

## Dateiaufbau

Alle mehrbyteigen Werte verwenden Little Endian. Offsets und die gesamte Dateigröße sind `Uint32`; VEGFILE v1 ist deshalb auf weniger als 4 GiB begrenzt.

```text
VEGFILE v1
├── Header                    128 Byte
├── LayerMetadata[]            16 Byte pro Layer
├── ChunkLookup[]               4 Byte pro möglichem Chunk
├── ChunkMetadata[]             8 Byte pro gespeichertem Chunk
├── HeightData[]
└── VegetationMaskData[]
```

## Header

Der Header beginnt mit der acht Byte langen Signatur `VEGFILE\0`. Er enthält insbesondere:

- Version, Header- und Dateigröße;
- Grid-Größe, Chunk-Größe und Grid-Ursprung;
- Anzahl gespeicherter Chunks und Layer;
- Seed, Achsen, Einheit und Modellgrenzen;
- Heightmap-Auflösung und Höhen-Bitbreite;
- Build-Fingerprint und CRC32-Dateiprüfsumme;
- absolute Offsets aller folgenden Abschnitte.

Nicht verwendete Headerbytes bleiben `0` und sind für spätere Formatversionen reserviert.

### Bytegenauer Header-Aufbau

| Offset | Größe | Datentyp | Inhalt |
|---:|---:|---|---|
| 0 | 8 | Bytes | Signatur `VEGFILE\0` |
| 8 | 2 | `Uint16` | Formatversion |
| 10 | 2 | `Uint16` | Headergröße, in v1 immer `128` |
| 12 | 4 | `Uint32` | Flags, in v1 `0` |
| 16 | 4 | `Uint32` | gesamte Dateigröße in Byte |
| 20 | 4 | `Uint32` | Grid-Breite in Chunks |
| 24 | 4 | `Uint32` | Grid-Höhe in Chunks |
| 28 | 4 | `Uint32` | Anzahl gespeicherter Chunks |
| 32 | 4 | `Uint32` | Anzahl der Vegetationslayer |
| 36 | 4 | `Uint32` | Seed |
| 40 | 4 | `Float32` | Chunk-Größe |
| 44 | 4 | `Float32` | Grid-Ursprung auf horizontaler Achse A |
| 48 | 4 | `Float32` | Grid-Ursprung auf horizontaler Achse B |
| 52 | 4 | `Float32` | Modelleinheiten pro Meter |
| 56 | 24 | 6 × `Float32` | `minX`, `minY`, `minZ`, `maxX`, `maxY`, `maxZ` |
| 80 | 1 | `Uint8` | Höhenachse: `x=0`, `y=1`, `z=2` |
| 81 | 1 | `Uint8` | horizontale Achse A |
| 82 | 1 | `Uint8` | horizontale Achse B |
| 83 | 1 | `Uint8` | Heightmap-Bitbreite: `8`, `16` oder `32` |
| 84 | 2 | `Uint16` | Heightmap-Auflösung pro Chunk-Achse |
| 86 | 2 | Bytes | reserviert, in v1 `0` |
| 88 | 4 | `Uint32` | Offset von `LayerMetadata[]` |
| 92 | 4 | `Uint32` | Offset von `ChunkLookup[]` |
| 96 | 4 | `Uint32` | Offset von `ChunkMetadata[]` |
| 100 | 4 | `Uint32` | Offset von `HeightData[]` |
| 104 | 4 | `Uint32` | Offset von `VegetationMaskData[]` |
| 108 | 16 | Bytes | Build-Fingerprint aus GLB-Bytes und kanonischer Compiler-Config |
| 124 | 4 | `Uint32` | CRC32-Prüfsumme der gesamten Datei; dieses Feld gilt bei der Berechnung als `0` |

Der Build-Fingerprint sind die ersten 16 Bytes eines SHA-256-Werts. Seine
Eingabe besteht aus einer festen v1-Kennung sowie den getrennten SHA-256-Werten
der unveränderten GLB-Bytes und der kanonisch nach Schlüsseln sortierten
Compiler-Config. Gleiche Eingaben erzeugen dadurch denselben Fingerprint.

Die CRC32-Prüfsumme beschreibt dagegen die konkrete `.veg`-Datei. Der Parser
berechnet sie erneut und lehnt beschädigte oder nachträglich veränderte Dateien
ab. Sie ist eine Integritätsprüfung und keine kryptografische Signatur.

Die Auflösung der Vegetationsmasken steht nicht im Header, weil jeder Layer eine eigene Auflösung besitzen kann. Sie wird deshalb im jeweiligen `LayerMetadata`-Eintrag gespeichert.

## Layer-Metadaten und Masken

Jeder Layer besitzt einen 16-Byte-Eintrag:

```text
LayerMetadata
├── layerId             Uint32
├── maskResolution      Uint16
├── flags/reserviert    Uint16
├── maskDataOffset      Uint32
└── maskDataByteLength  Uint32
```

Damit können Layer unterschiedliche Maskenauflösungen besitzen. Ihre Größe wird berechnet als:

```text
wordsPerChunk = ceil(maskResolution² / 32)
maskByteLength = storedChunkCount * wordsPerChunk * 4
```

Die Masken eines Layers enthalten alle gespeicherten Chunks hintereinander. Danach beginnt am `maskDataOffset` des nächsten Layers dessen Maskenbereich.

Die Zellindizierung und Bitposition sind fest definiert:

```text
cellIndex = cellY * maskResolution + cellX
wordIndex = floor(cellIndex / 32)
bitIndex  = cellIndex % 32
```

Zelle `0` verwendet das niedrigstwertige Bit. Unbenutzte Bits im letzten `Uint32` bleiben `0`.

## Chunk- und Höhendaten

`ChunkLookup` enthält `-1` für einen nicht gespeicherten Chunk oder dessen Index in den übrigen Chunkdaten. Eine zusätzliche Presence-Maske wird nicht gespeichert.

Jeder gespeicherte Chunk besitzt zwei `Float32`-Werte:

```text
minimumHeight
maximumHeight
```

Die unquantisierten Höhen des Datasets werden innerhalb dieses Intervalls auf einen vorzeichenlosen `8`-, `16`- oder `32`-Bit-Wert abgebildet. Dadurch kann der spätere `.veg`-Reader die Höhe wieder aus Min, Max und dem quantisierten Wert rekonstruieren.

Welche Höhe der Extractor bei überlappenden Flächen auswählt und wie er fehlende
Samples auffüllt, ist Teil des Extraktionsvertrags und wird in
`extractor/extractor.md` beschrieben. Der Writer verändert diese Semantik nicht.
