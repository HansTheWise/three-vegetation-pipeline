# Stabile Vegetations-IDs und Hashes

Die deterministische Zufälligkeit folgt einer Hierarchie:

```text
Cell
└── Anchor
    ├── Element 0
    ├── Element 1
    └── Element n
```

- Eine **Cell** ist ein Feld des Vegetationsrasters.
- Ein **Anchor** ist ein stabiler Platzierungspunkt innerhalb einer Cell.
- Ein **Element** ist ein optionales Unterobjekt eines Anchors. Bei Gras können
  mehrere Elemente einzelne Halme darstellen. Ein Baum oder Busch kann dagegen
  vollständig durch den Anchor repräsentiert werden und benötigt keinen
  zusätzlichen Element-Hash.

Alle Eingaben, Zwischenwerte und Ergebnisse sind vorzeichenlose 32-Bit-Werte.
LOD-Stufen ändern keine ID und keinen Hash. Sie entscheiden ausschließlich, wie
viele Anchor oder Elemente der stabilen Reihenfolge verwendet werden.

## Cell-ID und Cell-Hash

Die logische Cell-ID besteht aus:

```text
Cell-ID = Layer-ID + globale Cell-X-Koordinate + globale Cell-Y-Koordinate
```

Die globalen Cell-Koordinaten werden aus Chunkposition und lokaler Position
innerhalb des Chunks gebildet:

```text
globalCellX = chunkGridX * maskResolution + localCellX
globalCellY = chunkGridY * maskResolution + localCellY
```

Der Chunkindex ist kein zusätzlicher Teil der ID. Die globalen Koordinaten
enthalten seine Position bereits. Außerdem darf die Identität nicht von der
Reihenfolge abhängen, in der belegte Chunks im VEGFILE gespeichert sind.

Der Cell-Hash wird einmal berechnet:

```text
combined = seed
         XOR ((layerId + 1)      * layerSalt)
         XOR ((globalCellX + 1)  * cellXSalt)
         XOR ((globalCellY + 1)  * cellYSalt)

cellHash = mix(combined)
```

| Teil | Aufgabe |
| --- | --- |
| `seed` | Erzeugt für dasselbe Raster eine andere, aber reproduzierbare Verteilung. |
| `layerId` | Trennt Vegetationslayer an derselben Cell voneinander. |
| `globalCellX/Y` | Identifiziert die Cell unabhängig vom gespeicherten Chunkindex. |
| unterschiedliche Salts | Trennen gleiche Zahlen in unterschiedlichen Eingabefeldern. |
| `+ 1` | Verhindert, dass der Wert `0` durch die Multiplikation vollständig verschwindet. |
| `mix` | Verteilt Änderungen der Eingaben über alle 32 Ergebnisbits. |

### Belegte Bits des Cell-Hashes

| Bits | Länge | Verwendung |
| --- | ---: | --- |
| 0-7 | 8 | Pattern-Auswahlwert für maximal 256 Patterns |
| 8-9 | 2 | Rotation in Vierteldrehungen: 0°, 90°, 180° oder 270° |
| 10 | 1 | Spiegelung des Patterns |
| 11-31 | 21 | Noch nicht belegt |

Für die Patternauswahl wird der 8-Bit-Wert modulo `patternCount` gerechnet.
Die Konstanten dieser Belegung liegen in `CellHashLayout.ts`.

## Anchor-ID und Anchor-Hash

Die Anchor-ID erweitert die vollständige Cell-ID um den Index des Anchors im
ausgewählten Pattern:

```text
Anchor-ID = Cell-ID + anchorIndex
```

Zur Laufzeit muss die Cell-ID nicht erneut gehasht werden. Der bereits
berechnete Cell-Hash wird weiterverwendet:

```text
anchorHash = mix(
  cellHash XOR ((anchorIndex + 1) * anchorSalt)
)
```

| Teil | Aufgabe |
| --- | --- |
| `cellHash` | Bindet den Anchor an Seed, Layer und globale Cell. |
| `anchorIndex` | Identifiziert einen Anchor anhand seiner stabilen Reihenfolge im Pattern. |
| `anchorSalt` | Trennt die Anchor-Ableitung von Cell- und Element-Ableitungen. |
| `mix` | Verteilt Cell-Hash und Anchorindex erneut über alle 32 Bits. |

Der Anchor-Hash kann direkt alle Eigenschaften eines einzelnen Baums, Buschs
oder einer anderen Vegetationsinstanz bestimmen. Aktuell sind seine 32 Bits noch
nicht konkreten Eigenschaften zugewiesen. `AnchorHashLayout.ts` markiert sie
daher vollständig als unbelegt.

## Element-ID und Element-Hash

Ein Element wird nur verwendet, wenn ein Anchor mehrere unabhängig
randomisierte Unterobjekte enthält:

```text
Element-ID = Anchor-ID + elementIndex
```

Auch hier wird nur vom bereits vorhandenen Eltern-Hash abgeleitet:

```text
elementHash = mix(
  anchorHash XOR ((elementIndex + 1) * elementSalt)
)
```

| Teil | Aufgabe |
| --- | --- |
| `anchorHash` | Bindet das Element an seine vollständige Cell- und Anchor-Identität. |
| `elementIndex` | Identifiziert das Unterobjekt innerhalb des Anchors. |
| `elementSalt` | Trennt die Element-Ableitung von Cell- und Anchor-Ableitungen. |
| `mix` | Erzeugt einen gleichmäßig verteilten 32-Bit-Hash für das Element. |

Ein Gras-Anchor kann beispielsweise mehrere Elementindizes für mehrere Halme
verwenden. Für einen Anchor mit genau einem vollständigen Baum wäre dieser
Schritt redundant; dessen Eigenschaften sollten direkt aus dem Anchor-Hash
gelesen werden.

Der Gras-Renderer liest vier Formwerte direkt aus dem Element-Hash:

| Bits | Länge | Verwendung |
| --- | ---: | --- |
| 0-7 | 8 | Halmhöhe innerhalb des konfigurierten Intervalls |
| 8-15 | 8 | Halmbreite innerhalb des konfigurierten Intervalls |
| 16-23 | 8 | horizontale Halmausrichtung |
| 24-31 | 8 | Neigung bis zum konfigurierten Maximum |

Versatz und Farben sollen nicht sichtbar mit Höhe oder Breite korrelieren.
Deshalb wird aus dem Element-Hash mit einem eigenen Salt einmalig ein zweiter
Detail-Hash abgeleitet:

```text
detailHash = mix(elementHash XOR detailSalt)
```

| Bits | Länge | Verwendung |
| --- | ---: | --- |
| 0-7 | 8 | Richtung des Wurzelversatzes |
| 8-15 | 8 | Radius des Wurzelversatzes |
| 16-23 | 8 | Indexwert der unteren Farbpalette |
| 24-31 | 8 | Indexwert der oberen Farbpalette |

Die Farbwerte werden modulo Palettengröße ausgewählt. Deshalb begrenzt die
Runtime-Config beide Paletten auf jeweils 256 Farben. Alle Bitbereiche und der
Detail-Salt liegen zentral in `ElementHashLayout.ts`.

## Aufteilung im Code

```text
runtime/identity/
├── types.ts                 Cell-, Anchor- und Element-ID-Typen
├── VegetationIds.ts         Zusammensetzung, Hashableitung und gemeinsame Salts
├── CellHashLayout.ts        Bereits belegte Cell-Bits
├── AnchorHashLayout.ts      Künftige Anchor-Eigenschaftsbits
├── ElementHashLayout.ts     Halmform-, Versatz- und Farbwerte
└── identity.md              Dieser Vertrag
```

`vegetationIdentityShader.ts` enthält dieselbe Cell-, Anchor- und
Element- und Detail-Ableitung für GLSL. Die numerischen Salts und Bitbereiche
werden aus den TypeScript-Modulen eingesetzt, damit CPU- und GPU-Implementierung
nicht unbemerkt voneinander abweichen.
