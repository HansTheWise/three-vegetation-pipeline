# VEG Parser

Der Runtime-Parser liest bereits geladene VEGFILE-v2-Bytes und validiert ihren
vollständigen Aufbau.

```text
ArrayBuffer | Uint8Array → parseVegFile → ParsedVegFile
```

Er akzeptiert ausschließlich Version 2 und prüft unter anderem:

- Signatur, Headerwerte und CRC32;
- die aus `VegFileV2Layout` berechnete exakte Dateigröße;
- eindeutige Layer-IDs und gültige Maskenauflösungen;
- vollständige Chunk-Lookups und geordnete Höhenbereiche;
- Nullbytes für Alignment und ungenutzte Maskenbits.

`ParsedVegFile` enthält typisierte Ansichten auf die ursprünglichen Bytes:

- `chunkLookup` als `Int32Array`;
- Chunk-Minimum und -Maximum als interleavtes `Float32Array`;
- quantisierte Heightmaps entsprechend der gespeicherten Bitbreite;
- weiterhin bitgepackte `Uint32Array`-Masken.

Bei einem passend ausgerichteten Eingabepuffer werden diese Daten nicht
kopiert. Nur ein ungerade ausgerichteter `Uint8Array`-Ausschnitt erhält eine
neue, ausgerichtete Allocation.

Der Parser lädt keine URL und erzeugt keine GPU- oder Three.js-Objekte. Die
bytegenaue Formatspezifikation steht in
[`../../vegfile-v2-format/README.md`](../../vegfile-v2-format/README.md).
