# Implementierungsroadmap

Stand: 11. September 2026

## Zielbild

Die Pipeline extrahiert Vegetationsflächen einmalig aus einem Modell, speichert
sie rendererneutral im VEGFILE und erzeugt daraus zur Laufzeit austauschbare
Renderprofile. WebGL besitzt die GPU-Ressourcen und das Rendering; Parser,
Dataset, IDs und räumliche Daten bleiben davon unabhängig.

Der aktuelle Cleanup und der geplante Weg zu einer kleinen öffentlichen Runtime
sind im [Cleanup- und Refactorplan](CLEANUP_REFACTOR_PLAN.md) beschrieben.

## Aktueller Stand

| Bereich | Status | Vorhanden |
| --- | --- | --- |
| Offline-Reader | Fertig für VEGFILE v1 | GLB-Lesen, Modelltransformationen, neutrale Dreiecksprimitive und explizite Ablehnung nicht unterstützter Mesharten |
| Offline-Extraktion | Fertig für VEGFILE v1 | Chunk-Grid, Heightmaps, Layer-Masken, Steigungsfilter und stabiler Seed |
| Writer und Compiler | Fertig für VEGFILE v1 | Quantisierung, Bitpacking, CRC32, Build-Fingerprint, CLI und atomarer Dateiaustausch |
| Runtime-Parser und Dataset | Fertig | Vollständige Formatvalidierung, typisierte Ansichten, Config-Verbindung, Patterns und profilabhängige Vorbereitungsdaten |
| Deterministische Identität | Fertig | Cell-, Anchor- und Element-Hashes mit CPU-/GLSL-Vertrag |
| Sichtbarkeit und Density | Fertig für Grass | Chunk- und Tile-Frustum-Culling sowie kontinuierliche Cell-, Anchor- und Elementbudgets |
| WebGL-Grassrenderer | Fertig für den aktuellen Funktionsstand | GPU-Platzierung, Heightmap-Sampling, Geometrie, Farben, Ground-Übergang, Kameraausrichtung, Szenenlicht und eingehende Schatten |
| Debug und Messung | Vorhanden | Chunk-/Cell-/Frustumdarstellung, Kandidaten- und GPU-Diagnostik, Browsercheck und Patch-Benchmark |
| Öffentliche Runtime-Fassade | Fertig für Three.js/WebGL | `ThreeVegetationSystem`, automatische Standardadapter, Modulregistrierung, gemeinsamer Lifecycle und Frame-Diagnostik; direkte ältere Factories bleiben kompatibel |
| Austauschbare Renderprofile | Fertig für den Modulvertrag | Minimaler generischer Layerkern, moduleigene Config/Validierung/Vorbereitung/Renderer, gemeinsamer Bounds-Vertrag und anpassbares Grass-Preset |
| Lichtadapter | Fertig für WebGL/Three.js | Austauschbarer Materialvertrag, nativer Three.js-Licht-/Shadow-/Exposure-Pfad und layerspezifische Grass-Lichtreaktion |
| Grass-Patchfeature | Fertig für Three.js/WebGL | Grass-eigene Feldgenerierung, GPU-Ressource und optionaler Three.js-Surface-Adapter; der Consumer liefert nur die Materialauswahl |

## Nächste Schritte

### 1. Aktuellen Funktionsstand sichern — abgeschlossen

- Arbeitsbaum und unversionierte Artefakte bewusst sortieren;
- sauberen Build ohne alte `dist`-Dateien herstellen;
- Konfiguration, Tests und Dokumentation synchronisieren;
- Pipeline und I-CAKA technisch sowie durch die Benutzerabnahme prüfen;
- Pipeline und Consumer in getrennten, nachvollziehbaren Commits sichern.

### 2. Bibliothek und Consumer trennen — abgeschlossen

- I-CAKA-Konfigurationen und Campus-Assets aus dem generischen Produktbereich
  entfernen;
- neutrale kleine Fixtures und ein portables Beispiel bereitstellen;
- Campus-Surface-Namen ausschließlich im I-CAKA-Consumer halten;
- portable Unit-Tests von expliziten Consumer-Integrationstests trennen.

### 3. Runtime- und Renderprofilverträge stabilisieren — abgeschlossen

- globale Renderer-, Chunking- und Culling-Infrastruktur von allen
  layerspezifischen Einstellungen trennen;
- Distribution, Pattern, LOD/Density, Shadows und Lighting pro Layer halten;
- profilabhängige Geometrie- und Shaderwerte aus dem neutralen Layervertrag
  lösen und Grass als anpassbares Standardpreset bereitstellen;
- gemeinsame, profilabhängige Render-Bounds im globalen Chunk- und
  Tile-Culling verwenden.

### 4. Öffentliche Runtime-Fassade ergänzen — abgeschlossen

- Erzeugung, Frameupdate, Layerumschaltung und Cleanup bündeln;
- einen gemeinsamen Modell-/Koordinatenroot verwenden;
- einen Three.js-Standardadapter für Renderer, Szene, Kamera und
  `coordinateRoot` bereitstellen;
- Three-Kameradaten intern allokationsarm in einen neutralen Framezustand für
  gemeinsames Culling und Layer-Rendering übersetzen;
- Fehler während der Initialisierung transaktional aufräumen;
- synchrone und Worker-basierte Vorbereitung über dieselbe Grenze anbieten.

Die Runtime besitzt nun Objektbaum, Chunk-/Tile-Frameupdate, Layerumschaltung,
Diagnostik und idempotentes Cleanup. Fehlgeschlagene GPU-Erzeugungsstufen räumen
vorher angelegte Ressourcen wieder auf. I-CAKA verwendet den pipelineeigenen
Worker-Vertrag und seit Phase 7 die vollständige `createThreeVegetation`-Fassade.

### 5. Layer-Renderer und GPU-Ressourcen modularisieren — abgeschlossen

- gemeinsame VEGFILE-GPU-Ressourcen von Grass-Ressourcen trennen;
- Layer-Renderer über eine kleine Factory-/Registry-Grenze erzeugen;
- Grass über das eingebaute Profil registrieren und einen neutralen
  Testrenderer als Vertragstest verwenden.

Gemeinsame VEGFILE-Texturen und der Visible-Chunk-Buffer werden einmalig vom
WebGL-Adapter gehalten. Die Runtime wählt Renderer über `renderProfile.type`;
Grass besitzt seine Pattern-, Farb-, Patch-, Density-, Geometry- und
Materialressourcen nun selbst. Vertragstests decken ein fremdes Profil, den
Austausch des eingebauten Grass-Renderers und vollständiges Cleanup ab.

### 6. Three.js-Licht anbinden — abgeschlossen

- vorhandene Three.js-Licht-, Shadow-, Tone-Mapping- und Color-Space-Chunks als
  Standard-Lichtadapter kapseln;
- Lichtuniforms und Renderer-Exposure über den nativen Three.js-Materialpfad
  beziehen, ohne Lichter oder Belichtungswerte pro Frame zu kopieren;
- Vegetationsreaktion konfigurierbar halten, ohne Szenenlichter manuell zu
  duplizieren.

Der Grass-Renderer verwendet den nativen Three.js-Lichtpfad über
`ThreeSceneLightingAdapter`. Direkter und indirekter Anteil, Normalenquelle und
ein optionaler Licht-Distanzübergang sind ausdrückliche Layerwerte. Farb- und
Lichtübergang sind entkoppelt; I-CAKA bildet die bisherige Darstellung mit
identischen, separaten Kurven ab und überschreibt Shadow-Flags nicht erneut.

### 7. Grass-Patches anbinden und I-CAKA verschlanken — abgeschlossen

- Patch-Feld, GPU-Textur und Three.js-Surface-Anbindung als opinionated
  Grass-Feature halten; die generische Layerverwaltung kennt diesen Vertrag
  nicht;
- horizontale Achsen aus dem Dataset lesen und vollständiges Restore/Dispose
  garantieren;
- I-CAKA über `createThreeVegetation` anbinden und auf Campus-Materialauswahl,
  Assetzustand, R3F-Frameaufruf und optionale Debugoberfläche reduzieren.

### 8. Paket und Release absichern — abgeschlossen

- stabile Root- und Subpath-Exports sind definiert;
- das Tarball wird in einem temporären Three.js-Verbraucher installiert,
  typgeprüft und mit Vite gebaut;
- CLI-Hilfe und direkt importierte, erasable `.ts`-Config werden im Paket-Gate
  geprüft;
- README enthält Installation, System-/Preset-Einstieg, Modulregistrierung,
  Workergrenze und Cleanup;
- I-CAKAs lokaler Vite-Alias ist in einem gemeinsamen, ausdrücklich aktivierten
  Entwicklungshelper gebündelt; User und Admin bauen standardmäßig über die
  normale Paketauflösung;
- offen für Phase 9: echten WebGL-Browsertest in das finale Release-Gate
  aufnehmen.

## Spätere Erweiterungen

Diese Themen gehören nicht zum aktuellen Cleanup und werden erst nach stabiler
Runtime-Schnittstelle anhand eines konkreten Bedarfs geplant:

- Occlusion-Culling gegen Szenengeometrie;
- WebGPU-Adapter;
- Wind und weitere visuelle Effekte;
- produktive Baum-/Buschprofile;
- neue VEGFILE-Versionen für Überhänge, Instanzen oder zusätzliche Quelldaten;
- Performanceänderungen ohne reproduzierbares Profiling.
