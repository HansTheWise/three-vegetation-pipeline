# VEGFILE-Parsing

Dieses Modul liest VEGFILE-Bytes, validiert das Binärformat und stellt die
enthaltenen Daten als typisierte Ansichten bereit. Die Ansichten referenzieren
überwiegend direkt dieselbe Byte-Allokation; Höhen- und Maskendaten werden beim
Parsen nicht expandiert oder in rendererabhängige Strukturen umgewandelt.

## Ablauf und Verantwortlichkeiten

```text
ArrayBuffer oder Uint8Array
  -> VegFileV2Schema
     definiert feste Headerfelder, Konstanten und Formatversion
  -> VegFileV2ByteLayout
     berechnet Offsets, Byte-Längen, Dateigröße und Alignment
  -> VegParser.parseVegFile
     liest und validiert die Bytes und erzeugt typisierte Ansichten
  -> ParsedVegFileTypes
     definiert den TypeScript-Vertrag des Parser-Ergebnisses
  -> Runtime und Pre-Runtime-Core
     speichern Referenzen auf die Ansichten oder verarbeiten sie weiter
```

[`VegFileV2Schema`](../vegfile-format/VegFileV2Schema.ts) beschreibt die fest
gespeicherten Bestandteile von VEGFILE v2. Das
[`VegFileV2ByteLayout`](../vegfile-format/VegFileV2ByteLayout.ts) leitet daraus
zusammen mit den im Header gespeicherten Anzahlen und Auflösungen sämtliche
variablen Abschnittspositionen und -größen ab. Diese berechneten Werte werden
nicht zusätzlich in der Datei gespeichert.

[`VegParser`](./VegParser.ts) verwendet Schema und Byte-Layout, prüft unter
anderem Version, Dateilänge, Alignment, Wertebereiche und Prüfsumme und gibt
anschließend ein `ParsedVegFile` zurück.

[`ParsedVegFileTypes`](./ParsedVegFileTypes.ts) enthält ausschließlich die
Typdefinitionen dieses Ergebnisses. Die Datei führt selbst kein Parsing und
keine Konvertierung aus. Sie legt fest, welche validierten Headerdaten,
Chunk-Zuordnungen, Höhenansichten und Layer-Masken nach dem Parsing für weitere
Module verfügbar sind. TypeScript entfernt diese Typen beim Build; die
tatsächlichen Objekte und Typed-Array-Ansichten erzeugt `VegParser`.

Runtime-Dataset-Vorbereitung und rendererabhängige Verarbeitung bleiben
außerhalb dieses Moduls.
