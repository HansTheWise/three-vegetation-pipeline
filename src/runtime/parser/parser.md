# VEG Parser

Der Runtime-Parser liest bereits geladene `.veg`-Bytes und validiert den
vollständigen Aufbau von VEGFILE v1.

```text
ArrayBuffer | Uint8Array -> parseVegFile -> ParsedVegFile
```

Der Parser lädt keine URL und erzeugt keine Three.js- oder GPU-Objekte. Diese
Aufgaben bleiben bei einem späteren Loader beziehungsweise GPU-Adapter.

`ParsedVegFile` enthält typisierte Ansichten auf die ursprünglichen Dateibytes:

- `chunkLookup` als `Int32Array`;
- Chunk-Minimum und -Maximum als interleavtes `Float32Array`;
- quantisierte Heightmaps entsprechend der gespeicherten Bitbreite;
- eine weiterhin bitgepackte `Uint32Array`-Maske pro Layer.

Masken und Höhen werden nicht expandiert. Bei einem passend ausgerichteten
Eingabepuffer entstehen dafür keine weiteren Datenkopien. Nur ein ungewöhnlich
ausgerichteter `Uint8Array`-Ausschnitt wird einmal kopiert, damit die typisierten
32-Bit-Ansichten gültig angelegt werden können.

Der Parser kontrolliert Signatur, Version, Header, Offsets, berechnete
Section-Größen, Layer-IDs, Chunk-Lookup, Höhenintervalle, unbenutzte Maskenbits
und die CRC32-Prüfsumme der vollständigen Datei.
CPU- und GPU-Adapter dürfen deshalb anschließend von einem konsistenten
Dateiaufbau ausgehen.

Der Header stellt außerdem den 16 Byte langen Build-Fingerprint bereit. Ein
Loader kann ihn mit dem erwarteten Fingerprint einer bekannten Asset-Version
vergleichen, bevor ein GPU-Adapter Daten übernimmt.
