# VEG Writer

Der Writer kodiert ein neutrales `VegetationDataset` als VEGFILE v2.

```text
VegetationDataset + VegWriterConfig + Build-Fingerprint
                         ↓
                     Uint8Array
```

## Verantwortung

1. Writer-Config, Fingerprint und Dataset vollständig validieren.
2. Das Dateilayout über `calculateVegFileV2Layout` bestimmen.
3. Chunk-Höhen anhand ihrer gespeicherten Min-/Max-Bereiche auf die
   konfigurierten `8`, `16` oder `32` Bit quantisieren.
4. Je 32 logische Maskenzellen in ein `Uint32` packen.
5. Header, Metadaten und Datenabschnitte schreiben und abschließend CRC32
   eintragen.

Der Writer kennt keine Dateipfade und verwendet keine Node.js-APIs. Das
atomare Schreiben auf die Festplatte gehört zum `NodeVegCompiler`.

## Modulgrenzen

- `VegetationDatasetValidation` validiert den dateiformatunabhängigen Eingang.
- `VegFileV2Schema` definiert feste Headerfelder und Prüfsumme.
- `VegFileV2Layout` berechnet alle nicht gespeicherten Abschnittspositionen.
- `VegWriter` führt ausschließlich die v2-Binärkodierung aus.

Die bytegenaue Formatspezifikation steht in
[`../../vegfile-v2-format/README.md`](../../vegfile-v2-format/README.md).
