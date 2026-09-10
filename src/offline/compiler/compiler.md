# Offline-Compiler

Der Offline-Compiler verbindet die bestehenden Module, ohne deren Aufgaben zu vermischen.

```text
GLB-Datei
→ Reader
→ Extractor
→ Writer
→ .veg-Datei
```

## Schnittstellen

`compileGlbToVeg` verarbeitet einen GLB-`ArrayBuffer` plattformunabhängig und liefert Dataset, VEGFILE-Bytes, den reproduzierbaren Build-Fingerprint und einen kurzen Bericht.

`createVegFile` ist die Node.js-Dateischnittstelle. Sie liest eine `.glb`-Datei, kompiliert sie und ersetzt die angegebene `.veg`-Datei erst, nachdem die vollständige neue Datei erfolgreich erzeugt wurde.

Die Kommandozeile übernimmt lediglich Pfade und lädt die Config. Reader, Extraktion und Binärkodierung bleiben in ihren jeweiligen Modulen.

Die Config enthält nur veränderbare Werte. GLB-Reader, modelllokaler Raum,
Chunk-/Samplingverfahren sowie VEGFILE-v1-Format und Byte-Reihenfolge sind
Eigenschaften der implementierten Pipeline und keine wirkungslosen
Ein-Auswahl-Optionen.

## Kommandozeile

Der lokale Befehl baut zuerst den Compiler und erzeugt anschließend die Datei:

```text
npm run veg:compile -- \
  --input <model.glb> \
  --config <vegetation.config.ts> \
  --output <asset.veg>
```

Nach erfolgreicher Erstellung werden Mesh- und Dreiecksanzahl, gespeicherte Chunks, Layerauflösungen, Seed, Build-Fingerprint und Dateigröße ausgegeben. Bei einem Fehler bleibt die zuvor vorhandene Ausgabedatei unverändert.

Unter Windows kann der Compiler auch ohne global installiertes `npm` gestartet werden:

```text
veg-compile.cmd \
  --input <model.glb> \
  --config <vegetation.config.ts> \
  --output <asset.veg>
```

Der Starter verwendet zuerst ein über `PATH` verfügbares Node.js und kann in der Codex-Arbeitsumgebung auf deren gebündelte Node-Laufzeit zurückgreifen.
