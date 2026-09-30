# Prepared vegetation dataset

`VegFileDatasetCreationManager` übergibt die geparste VEGFILE-Struktur
und Runtime-Konfiguration an `createPreparedVegetationDataset`. Diese Funktion
verbindet konfigurierte Layer über ihre stabile ID mit den geparsten
VEGFILE-Layern. Die Config ist dabei eine bewusste Auswahl:

- VEGFILE-Layer ohne Config werden ignoriert;
- Config-Layer mit `enabled: false` erhalten nur die allgemeine ID-Prüfung;
- nur konfigurierte und aktivierte Layer erscheinen in `preparedLayers`;
- eine Config-ID ohne passenden VEGFILE-Layer ist ein Fehler.

Jeder vorbereitete Layer referenziert seine Dateidaten und Config ohne Kopie. Er
enthält außerdem `preparedProfileData`, die Cell-Größe in Modellkoordinaten und
die vom Profil berechneten `cullingBounds`. Grass bereitet dort Patterns, aktive
Cells und optional das Boden-Patchfeld vor.

`combinedCullingBounds` enthält komponentenweise die größten Bounds aller
vorbereiteten Layer. Das gemeinsame grobe Chunk-Culling verwendet diesen Wert;
feineres Tile-Culling verwendet die Bounds des jeweiligen Layers.

`storedChunkGridCoordinateLookup` ist die einmalig invertierte Chunk-Zuordnung:
Während `file.chunkLookup` eine Gridposition auf einen gespeicherten Chunkindex
abbildet, liefert dieses Array für jeden gespeicherten Chunk direkt dessen
Grid-X/Y-Koordinaten. CPU-Vorbereitung, Culling und GPU-Upload teilen dieselbe
Referenz.

Die Runtime-Config wird nicht nochmals im Dataset gespeichert. Große VEGFILE-
Arrays bleiben unverändert und werden nicht kopiert.

Sind alle Layer deaktiviert oder unkonfiguriert, legt die WebGL-Runtime auch
keine gemeinsamen GPU-Ressourcen an.
