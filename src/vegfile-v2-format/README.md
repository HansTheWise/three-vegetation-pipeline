# VEGFILE v2

VEGFILE v2 ist die persistente, rendererunabhängige Vegetationsschnittstelle.
Writer und Parser verwenden `VegFileV2Schema` und `VegFileV2Layout` als
gemeinsame Quelle für Feldpositionen und Abschnittsgrößen.

Der Parser akzeptiert ausschließlich Version 2. Es gibt keinen v1-
Kompatibilitätspfad.

## Aufbau

Alle mehrbyteigen Werte sind Little Endian. Abschnittsoffsets und Dateigröße
werden nicht gespeichert, weil das feste Schema sie eindeutig berechnet.

```text
Header                    96 Byte
LayerMetadata[]            8 Byte pro Layer
ChunkLookup[]              4 Byte pro logischem Chunk
ChunkHeightRanges[]        8 Byte pro gespeichertem Chunk
HeightData[]
Alignment                  0-3 Nullbytes
VegetationMaskData[]
```

### Header

| Offset | Größe | Typ | Inhalt |
|---:|---:|---|---|
| 0 | 8 | Bytes | `VEGFILE\0` |
| 8 | 2 | `Uint16` | Version `2` |
| 10 | 2 | `Uint16` | Heightmap-Auflösung pro Chunkachse |
| 12 | 4 | `Uint32` | Gridbreite |
| 16 | 4 | `Uint32` | Gridhöhe |
| 20 | 4 | `Uint32` | gespeicherte Chunks |
| 24 | 4 | `Uint32` | Layeranzahl |
| 28 | 4 | `Uint32` | Seed |
| 32 | 4 | `Float32` | Chunkgröße |
| 36 | 4 | `Float32` | Gridursprung, horizontale Achse A |
| 40 | 4 | `Float32` | Gridursprung, horizontale Achse B |
| 44 | 4 | `Float32` | Modelleinheiten pro Meter |
| 48 | 24 | 6 × `Float32` | vollständige Modellgrenzen: Min/Max für x, y und z |
| 72 | 1 | `Uint8` | Höhenachse: `x=0`, `y=1`, `z=2` |
| 73 | 1 | `Uint8` | horizontale Achse A |
| 74 | 1 | `Uint8` | horizontale Achse B |
| 75 | 1 | `Uint8` | Höhenwerte: `8`, `16` oder `32` Bit |
| 76 | 16 | Bytes | Build-Fingerprint |
| 92 | 4 | `Uint32` | CRC32 der vollständigen Datei |

Bei der CRC32-Berechnung werden die vier Prüfsummenbytes als `0` behandelt.
Der Build-Fingerprint identifiziert GLB-Eingabe und Compiler-Config; die CRC32
erkennt beschädigte Dateibytes.

Die Modellgrenzen beschreiben die vollständige eingelesene Geometrie. Sie sind
nicht mit den Höhenbereichen gespeicherter Vegetationschunks identisch. Writer
und Parser erhalten dieses v2-Feld, die aktuelle Runtime besitzt dafür jedoch
keinen Verbraucher.

### Layer und Masken

Jeder Metadateneintrag enthält:

```text
layerId          Uint32
maskResolution   Uint16
alignment        2 Nullbytes
```

Masken folgen am Dateiende in Layerreihenfolge. Ihre Größe ist vollständig
ableitbar:

```text
cellsPerChunk = maskResolution²
wordsPerChunk = ceil(cellsPerChunk / 32)
maskByteLength = storedChunkCount * wordsPerChunk * 4
```

Innerhalb eines Wortes verwendet die erste Zelle das niedrigstwertige Bit.
Ungenutzte Bits des letzten Wortes bleiben `0`.

### Chunks und Höhen

`ChunkLookup` enthält pro logischem Chunk `-1` oder dessen gespeicherten Index.
Gridkoordinaten werden nicht zusätzlich gespeichert und ergeben sich aus der
Position im Lookup.

Jeder gespeicherte Chunk besitzt ein `Float32`-Minimum und -Maximum. Diese
Bereiche werden zur Laufzeit für Culling und zur Rekonstruktion der
quantisierten Höhen verwendet:

```text
height = minimumHeight
       + quantizedHeight / maximumQuantizedHeight
       * (maximumHeight - minimumHeight)
```

Die per Config gewählte Bitbreite steuert Dateigröße und Höhenpräzision.
