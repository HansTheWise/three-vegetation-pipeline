# Cleanup- und Refactorplan

Stand: 10. September 2026

## Ausführungsstand

- Phase 0 ist abgeschlossen: Der bestehende visuelle Stand einschließlich
  `lighting.directLightWeight: 0.95` bleibt die akzeptierte Baseline.
- Phase 1 ist abgeschlossen: Konfiguration, Tests und Dokumentation stimmen
  überein; der Build leert `dist/`; lokale Referenzbilder sind ausgeschlossen;
  Paket- und I-CAKA-Runtime wurden technisch geprüft.
- Phase 2 ist abgeschlossen: Pipeline-Code, Tests und Beispiel sind
  campusneutral; I-CAKA besitzt Assetpfad, globalen Schalter, Compilerconfig und
  eine gemeinsame Surface-Identität.
- Phase 3 ist abgeschlossen: gemeinsame Layerwerte und profilabhängige
  Renderwerte sind getrennt; Grass liegt als anpassbares Preset vor; Chunk- und
  Tile-Culling verwenden denselben profilabhängigen Bounds-Vertrag.
- Phase 4 ist abgeschlossen: Runtime-Fassade, transaktionaler Lifecycle,
  synchrone und Worker-basierte Vorbereitung sowie Three-Kamera- und
  Scene-Adapter bilden den einfachen Integrationseinstieg.
- Als Nächstes folgt Phase 5 mit austauschbaren Layer-Renderern und der Trennung
  gemeinsamer von profilspezifischen GPU-Ressourcen.

## Ziel

Der gegenwärtig zufriedenstellende Vegetationsstand wird zuerst korrigiert,
technisch abgesichert und als nachvollziehbare Baseline committed. Danach wird
die Pipeline schrittweise zu einer einfach einbindbaren Three.js-Bibliothek mit
wenigen stabilen Einstiegspunkten umgebaut.

Am Ende soll eine Anwendung:

1. VEGFILE-Bytes und eine serialisierbare Konfiguration liefern,
2. die Vegetation als ein `Object3D` in ihre Szene hängen,
3. pro Frame nur Kamera und Transformationsbezug aktualisieren und
4. alle Ressourcen über einen einzigen `dispose()`-Aufruf freigeben.

Rendererprofile, Ground-Anbindung und Beleuchtungsreaktion bleiben
austauschbar. Parser, VEGFILE v1, deterministische IDs, Density-Kurven und die
bewährte WebGL-Platzierung werden dabei nicht unnötig neu entwickelt.

## Nachgewiesener Ausgangszustand

### Pipeline-Repository

- Typecheck: bestanden.
- Tests: 19 Testdateien mit 146 Tests bestanden.
- Build: bestanden.
- `git diff --check`: keine Whitespace-Fehler; viele LF/CRLF-Hinweise.
- Der Arbeitsbaum enthält einen großen, noch nicht commiteten Funktionsstand:
  Patch-Feld, kontinuierliche Density, Tile-Frustum-Culling, Ground-Farbübergang,
  Lighting, Debugdiagnostik, Browser-Test und Benchmark.
- `dist/` wird vor einem Build nicht geleert. Dadurch liegen dort noch gebaute
  Dateien des inzwischen gelöschten alten LOD-Moduls, die ein Paket weiterhin
  veröffentlichen würde.
- `texture_test/` enthält zehn unversionierte HEIC-Dateien mit zusammen rund
  107 MiB. Diese visuellen Referenzen dürfen nicht versehentlich committed
  werden.
- Der echte WebGL-Browsertest gehört derzeit nicht zu `npm run verify`.

### I-CAKA-Repository

- User-, Admin- und Tooling-Typecheck: bestanden.
- Gezielte Vegetationstests: 29 von 30 bestanden.
- Der eine Fehler ist eine reale Inkonsistenz: Die aktuelle Config verwendet
  `lighting.directLightWeight: 0.95`, der Test und die README erwarten noch
  `0.35`.
- Die aktuelle Config enthält weitere veraltete Kommentare und wirkungslose
  Kurvenpunkte: `renderTileSizeCells: 8` entspricht bei 0,25-m-Cells 2 m und
  nicht 8 m; der Kommentar nennt vier Anchors, konfiguriert sind fünf; nach
  `activeCells: 0` haben spätere Anchor-/Elementpunkte keine sichtbare Wirkung.
- `CampusVegetation.tsx` verdrahtet derzeit selbst Worker, Parser/Dataset,
  Culling, GPU-Ressourcen, Grass-View, Ground-Patch, Frame-Matrizen, Debug,
  URL-Zustand und Cleanup. Damit ist I-CAKA faktisch eine zweite Runtime-Schicht.

Der Phase-1-Abschluss enthält einen echten Browser-Render gegen die produktiven
I-CAKA-Assets. Worker, Ground-Patch und produktiver Shader liefen ohne gemeldete
Shaderfehler. Die visuelle Abnahme bleibt unabhängig davon Aufgabe des Benutzers.

## Wichtigste Korrekturen

### Priorität 0: vor dem ersten Commit

1. **Config, Test und Dokumentation widersprechen sich.**
   Wenn `0.95` zum aktuell akzeptierten Bild gehört, werden I-CAKA-Test und
   README auf `0.95` korrigiert. Falls `0.35` gewollt ist, wird stattdessen nur
   die Config zurückgestellt. Diese visuelle Entscheidung darf nicht aus einem
   alten Test abgeleitet werden.
2. **Der Build kann gelöschte Dateien veröffentlichen.**
   `dist/` muss vor dem Release-Build kontrolliert geleert werden. Danach wird
   der Paketinhalt geprüft.
3. **Private Testbilder liegen im Arbeitsbaum.**
   `texture_test/` wird ignoriert oder außerhalb des Repositories aufbewahrt,
   nicht stillschweigend gelöscht.
4. **Dokumentation beschreibt nicht den aktuellen Stand.**
   Roadmap, Runtime-Datenfluss und I-CAKA-README werden vor dem Baseline-Commit
   auf die tatsächlich implementierte Density-, Patch-, Culling- und
   Renderingstrecke gebracht.

### Priorität 1: Korrektheit und Modularität

1. **Culling-Bounds sind hardcodiert und zu klein.**
   Chunk-Culling verwendet pauschales Padding von 0,25 m, Tile-Culling 0,5 m
   und kennt direkt `blade.heightMeters.maximum`. Bereits 0,5-m-Gras kann damit
   außerhalb der groben Chunk-Bounds liegen; Büsche oder Bäume erst recht.
   Chunk und Tile müssen dieselben Bounds aus dem jeweiligen Renderprofil
   verwenden.
2. **Der Runtime-Vertrag ist grasspezifisch.**
   `VegetationRuntimeLayerConfig` enthält Halmgeometrie, Halmfarben, Thickness
   und Grass-Lighting. Ein neutraler Layerkern und ein diskriminiertes
   Renderprofil müssen getrennt werden.
3. **Die Anwendung muss zu viele Interna kennen.**
   Parser, Dataset, Bounding Boxes, Frustum, GPU-Adapter, View, Matrixrechnung
   und Dispose werden heute im Beispiel und in I-CAKA von Hand zusammengesetzt.
4. **Austauschbarkeit ist noch keine echte Schnittstelle.**
   Pattern-, Patch-, Density-, Geometrie- und Shadererzeugung werden über feste
   Klassen/Funktionen instanziiert. Es fehlen wenige, gezielte Strategy-Grenzen.
5. **Farb- und Lichtpolitik sind gekoppelt.**
   Der Ground-Farbübergang fährt im Grass-Fragmentshader den direkten
   Lichtanteil implizit auf `1.0`. Eine Farboption darf nicht versteckt das
   Lichtmodell ändern.

### Priorität 2: Paket- und Integrationshygiene

1. Der Root-Export veröffentlicht derzeit neben dem Nutzungsvertrag auch rohe
   Shader, GPU-Puffer, Hashlayouts und Debugcontroller.
2. Das generische Repository enthält I-CAKA-Konfigurationen, `campus.glb`,
   `campus.veg` und ein Campus-zentriertes einziges Beispiel.
3. Der Campus-Integrationstest kann bei fehlendem Schwester-Checkout
   stillschweigend übersprungen werden.
4. Beide I-CAKA-Vite-Configs erzwingen einen relativen `dist`-Alias zum
   Schwester-Repository. Ein frischer Checkout, CI oder externer Verbraucher
   funktioniert damit nicht eigenständig.
5. Die frühere Patch-Implementierungsplanung mischte historische Planung,
   abgeschlossene Arbeit und I-CAKA-Migration. Sie wird durch einen aktuellen
   Patchvertrag ersetzt. Die README ist weiterhin zu kurz für eine echte
   Paketnutzung.

## Empfohlene Zielarchitektur

```text
Three.js-Anwendung oder dünner R3F-Wrapper
  -> lädt Bytes und hält App-Zustand
  -> ThreeVegetationSceneAdapter (Standardintegration)
       -> Renderer, Szene, Kamera und coordinateRoot
       -> ThreeCameraAdapter -> neutraler VegetationFrameState
       -> createWebGLVegetationRuntime(...)
       -> Parser + Runtime-Dataset
       -> gemeinsames Culling und Frame-Planning
       -> gemeinsame WebGL-Assetressourcen
       -> LayerRenderer-Registry
            -> GrassRenderProfile
                 -> Placement/Density
                 -> Grass-Geometrie und Material
                 -> ThreeSceneLightingAdapter (Standard)
            -> weitere Profile erst bei echtem Bedarf
       -> optionaler GroundSurfaceAdapter
  -> runtime.object3d
  -> runtime.updateFrame()
  -> runtime.dispose()
```

Die minimale öffentliche Verwendung soll ungefähr so aussehen:

```ts
const runtime = await createThreeVegetation({
  renderer,
  scene,
  camera,
  source: vegetationBytes,
  config: vegetationConfig,
  coordinateRoot: modelRoot,
  preparation: createWorkerPreparationAdapter(),
  layerRenderers: [
    createGrassLayerRenderer({
      lighting: createThreeSceneLightingAdapter(),
    }),
  ],
  ground: createGroundPatchMaterialAdapter({
    targets: groundMaterials,
    albedoMode: 'replace',
  }),
})

runtime.updateFrame()
runtime.dispose()
```

Die endgültigen Namen werden erst beim API-Test festgelegt. Wichtig ist der
Vertrag, nicht diese exakte Syntax. Wer die automatische Szenenbindung nicht
verwenden möchte, kann weiterhin die niedrigere Runtime-Fassade verwenden,
`object3d` selbst einhängen und die internen Adapter gezielt ersetzen.

## Architekturentscheidungen

### Gezielte Adapter statt Plugin-System für jede Funktion

Empfohlen wird eine kleine Zahl tragender Grenzen:

- Preparation-Adapter: synchron oder Worker;
- Scene-Adapter: bequeme Standardintegration und Besitz der Ein-/Aushängung;
- Camera-Adapter: Three-Kamera und Modellroot in neutralen Framezustand abbilden;
- Layer-Renderer-Factory: Grass heute, weitere Profile später;
- Lighting-Adapter: Three-Szenenlicht als Standard, alternatives Modell optional;
- Ground-Surface-Adapter: Materialbindung der Hostanwendung.

Parser, VEGFILE, IDs, Patternalgorithmen und einzelne mathematische Hilfsfunktionen
erhalten keine Mikrointerfaces. Ein vollständiges Plugin-System wäre mehr Code
als Nutzen und würde den Cleanup unnötig riskant machen.

### Beleuchtung

Der Standardadapter verwendet weiterhin direkt die vorhandenen Three.js-Lichter,
Shadowmaps, Tone Mapping, Renderer-Exposure und Output-Farbraum-Chunks. I-CAKA
muss weder Sonnenposition noch Lichtfarbe oder Intensität pro Frame in eigene
Vegetationsuniforms kopieren. Das aktuelle Day/Night-System bleibt damit die
einzige Quelle für Szenenlicht.

Konfigurierbar sind nur die Vegetationsentscheidungen:

- direkter und indirekter Lichtanteil;
- Normalenquelle `ground`, `geometry` oder eine definierte Mischung;
- Shadow-Empfang und optionales Shadow-Werfen;
- ein expliziter entfernungsabhängiger Lichtübergang, falls er visuell benötigt
  wird.

Three-interne Shader-Chunks und deren Versionsabhängigkeit liegen ausschließlich
im `ThreeSceneLightingAdapter`. Ein alternativer Adapter kann ein anderes
Lichtmodell bereitstellen, ohne VEGFILE, Placement oder Density zu ändern.

Der Standardadapter zählt oder kopiert keine Lichter pro Frame. Materialien
melden Three.js über `lights: true`, dass sie am nativen Lichtpfad teilnehmen;
die benötigten Licht- und Shadow-Uniforms sowie Renderer-Exposure werden vom
Renderer aktualisiert. Der Scene-Adapter besitzt deshalb keine Sonne und kein
Day/Night-Modell, sondern verbindet die Vegetation nur mit derselben Szene und
demselben Renderer wie die übrigen Objekte.

### Kamera- und Frame-Daten

Der `ThreeCameraAdapter` liest die aktuelle Three-Kamera und den gemeinsamen
`coordinateRoot` aus und erzeugt daraus einen implementationsneutralen,
wiederverwendeten `VegetationFrameState`. Dieser enthält nur die Daten, die
gemeinsames Chunk-/Tile-Culling und Layer-Rendering tatsächlich benötigen, zum
Beispiel Clip-aus-Modell-Matrix und Kameraposition im Modellraum. Three-Klassen
werden nicht in den neutralen Culling-Kern durchgereicht.

Die Standardintegration aktualisiert diese Daten in `runtime.updateFrame()`.
Ein Consumer muss daher weder Kameramatrizen selbst umrechnen noch zusätzliche
Uniforms synchronisieren. Gleichzeitig kann eine Anwendung den Camera-Adapter
ersetzen, etwa für mehrere Viewports, eine XR-Kamera oder vorab berechnete
Framezustände, ohne Layerprofile oder Dataset zu verändern. Temporäre Matrizen
und Frusta werden wiederverwendet, damit der Adapter keine vermeidbaren
Allokationen im Renderloop erzeugt.

### Serialisierbare Config bleibt frei von Implementierungsobjekten

Die Runtime-Config muss durch den Worker übertragbar bleiben. Sie enthält Daten,
aber keine Funktionen oder Klasseninstanzen. Renderer- und Lighting-Adapter
werden beim Erzeugen der Runtime separat registriert. `assetUrl` und ein
Anwendungs-Hauptschalter gehören in die Host-/Delivery-Konfiguration, nicht in
den Datasetvertrag.

## Arbeitsphasen

### Phase 0 – Entscheidungen und Baseline einfrieren

Ziel: Den akzeptierten sichtbaren Stand eindeutig beschreiben, bevor Code
bereinigt wird.

Arbeiten:

1. Bestätigen, ob I-CAKAs aktuelles `directLightWeight: 0.95` zum akzeptierten
   Stand gehört.
2. Aktuelle nahe, mittlere und ferne Density-/Farbwerte als Baseline notieren;
   keine neuen Tuningwerte im Cleanup erfinden.
3. Alle unversionierten Dateien klassifizieren:
   - Runtime-/Testdateien: übernehmen;
   - Benchmark und Browsercheck: übernehmen und dokumentieren oder bewusst
     weglassen;
   - HEIC-Dateien: ignorieren/auslagern;
   - generierte Snapshots: nur übernehmen, wenn ihr Test sie reproduziert.
4. Prüfbefehle und erwartete Ergebnisse dokumentieren.

Gate:

- Keine ungeklärte visuelle Configabweichung.
- Jede unversionierte Datei hat eine bewusste Entscheidung.
- Noch kein Architekturrefactor.

### Phase 1 – Gegenwärtigen Stand commit-fähig bereinigen

Ziel: Den heutigen Funktionsumfang ohne öffentliche Neugestaltung sauber
sichern.

Pipeline:

1. `dist/` vor dem Build kontrolliert leeren und einen sauberen Build prüfen.
2. Gelöschte alte LOD-/Debugdateien gegen ihre Nachfolger prüfen; keine stale
   Buildausgabe oder Exporte behalten.
3. Roadmap und Runtime-Dokumentation auf den aktuellen Datenfluss korrigieren.
4. Benchmark, Browsercheck und Snapshot an einen eindeutigen Test-/Toolingplatz
   übernehmen.
5. Eine `.gitattributes`-Regel für stabile Textzeilenenden ergänzen, ohne den
   gesamten Arbeitsbaum neu zu formatieren.

I-CAKA:

1. Config, Test und README auf den bestätigten Lighting-Wert bringen.
2. Falsche Kommentare und nachweislich wirkungslose Kurvenpunkte entfernen,
   ohne die Darstellung zu verändern.
3. Bestehenden Worker-, Ground-, Toggle- und Cleanup-Stand vollständig in den
   Commit aufnehmen.

Verifikation:

- Pipeline: Typecheck, 146 bestehende Tests, Clean-Build, echter
  Vite-WebGL-Shadercheck und expliziter ICAKA-Asset-Test.
- I-CAKA: Vegetationstests, Tooling/User/Admin-Typecheck, Shared-Lint,
  `vegetation:check`, User- und Admin-Build.
- Benutzer: visuelle Kontrolle bei Tag, Dämmerung und Nacht sowie naher und
  ferner Kamera.

Commit-Grenze:

1. Pipeline zuerst, zum Beispiel
   `feat(runtime): finalize patch-aware vegetation rendering`.
2. Danach I-CAKA, zum Beispiel
   `feat(vegetation): finalize pipeline integration baseline`.

Zwei Repositories können keinen atomaren gemeinsamen Commit bilden. Der
I-CAKA-Commit muss deshalb auf einen konkret geprüften Pipeline-Commit zeigen.

### Phase 2 – Projektverantwortung und eine Quelle pro Vertrag

Ziel: Generische Bibliothek und Campus-Consumer klar trennen.

Arbeiten:

1. I-CAKA-Produktionsconfig und Campus-Assets aus dem generischen
   Pipeline-Produktbereich entfernen.
2. Pipeline-Tests von `icakaVegetationRuntimeConfig` auf neutrale kleine
   Fixtures umstellen.
3. Ein kleines generisches Beispiel bereitstellen. Die reale Campus-Prüfung
   bleibt ein expliziter Consumer-/Integrationstest in I-CAKA.
4. In I-CAKA eine einzige Campus-Surface-Identität definieren und daraus
   Offline-Compilerselektor, Modellsetup und Ground-Materialauswahl ableiten.
   `surfice`/`surface` und `map_grun` dürfen nicht an mehreren Stellen eigene
   Wahrheiten bilden.
5. Hostfelder wie Asset-URL und globales `enabled` von der serialisierbaren
   Runtime-/Layerkonfiguration trennen.

Gate:

- Kein `icaka`, `campus`, `map_grun` oder `surfice` im produktiven
  Pipeline-Code.
- Portable Unit-Tests benötigen keinen benachbarten Checkout.
- Der explizite I-CAKA-Integrationstest schlägt bei fehlendem erforderlichem
  Asset klar fehl, statt unbemerkt grün zu werden.

Commit: `refactor(core): separate library and icaka ownership`

### Phase 3 – Globale Runtime- und Layerverträge korrigieren

Ziel: Layerunabhängige Renderinfrastruktur, layerspezifische Entscheidungen und
profilabhängige Implementierungen eindeutig trennen.

Arbeiten:

1. Einen globalen Runtime-Vertrag für gemeinsam genutzte Infrastruktur
   definieren: Koordinatenbezug, Renderer-Backend, VEGFILE-Dataset,
   Chunk-Struktur, Frustum-Auswertung, Diagnostik und den späteren
   Occlusion-Culling-Einstieg. Implementierungsobjekte bleiben Runtime-Optionen
   und werden nicht als scheinbar serialisierbare Configwerte ausgegeben.
2. Einen neutralen Layervertrag für stabile ID/Key, Aktivierung, Pattern,
   Verteilung, LOD/Density, Sichtbarkeit, Shadows und Lighting definieren. Diese
   Werte werden pro Layer entschieden; Gras, Büsche und Bäume dürfen jeweils
   andere Einstellungen verwenden.
3. Profilabhängige Einstellungen hinter einem eindeutigen Profiltyp halten.
   Grass besitzt Halmgeometrie, Farben, Thickness, Kameraausrichtung und seine
   weiteren Shaderparameter. Spätere Baum- oder Buschmodule definieren eigene
   Einstellungen, ohne Grass-Felder vortäuschen zu müssen.
4. Grass als vollständiges, opinionated Standardpreset der Bibliothek anbieten.
   Es funktioniert ohne eigene Modulentwicklung, bleibt aber über normale
   Layer- und Grass-Profilwerte anpassbar und enthält keine I-CAKA-Werte.
5. Chunking und Culling als gemeinsame Systeme beibehalten. Basis-Chunkdaten und
   Frustumebenen werden nur einmal erzeugt. Ein neutraler
   `VegetationRenderBounds`-Vertrag übergibt dem gemeinsamen Culler jedoch die
   Ausmaße jedes Layerprofils. Ein konservativer globaler Grobpass kann die
   größten aktiven Bounds verwenden; der layerspezifische Pass verfeinert mit
   eigenen Bounds, Sichtweite und LOD.
6. Chunk- und Tile-Frustum-Culling auf denselben Bounds-Vertrag umstellen und
   Tests für niedriges Gras sowie ein deutlich höheres Dummyprofil ergänzen.
7. WebGL-Instanzgrenzen anhand des tatsächlich sicheren `GLsizei`-Bereichs
   validieren.
8. Offline-Felder, die nur eine zulässige Ausprägung vortäuschen, entweder
   entfernen oder erst dann zu Strategien machen, wenn ein zweiter echter
   Verbraucher existiert.

Gate:

- Globale Runtime-Einstellungen enthalten keine Grass-, Baum- oder Buschwerte.
- Ein Layer kann ohne `blade`-Felder beschrieben und von einem eigenen
  Profilmodul verarbeitet werden.
- Distribution, Pattern, LOD/Density, Shadows und Lighting bleiben pro Layer.
- Shared Chunking/Culling wird nicht pro Layer dupliziert und verarbeitet
  trotzdem korrekte profilabhängige Bounds.
- Das eingebaute Grass-Preset erzeugt ohne I-CAKA-Abhängigkeit eine vollständige,
  gültige Grass-Konfiguration und lässt gezielte Overrides zu.
- Tests decken mindestens 0,5-m-Gras und ein deutlich höheres Dummyprofil ab.
- VEGFILE v1, deterministische IDs und sichtbares Grass-Verhalten bleiben
  unverändert.

Commit: `refactor(runtime): separate layer core and render profiles`

### Phase 4 – Kleine Runtime-Fassade und transaktionaler Lifecycle

Ziel: Anwendungen müssen keine Pipeline-Infrastruktur mehr selbst orchestrieren.

Arbeiten:

1. Eine High-Level-WebGL-Runtime einführen, die Dataset, Bounding Boxes,
   Frustum, gemeinsame GPU-Ressourcen, Layer-Views und Cleanup besitzt.
2. Öffentliche Oberfläche auf `object3d`, `updateFrame`, `setLayerEnabled`,
   schreibgeschützte Diagnostik und `dispose` begrenzen.
3. Einen gemeinsamen `coordinateRoot` verwenden. Ground-Feld, Vegetationsmesh,
   Kameraumrechnung und Culling müssen dieselbe Modellraumgrenze teilen.
4. Erzeugung transaktional machen: Schlägt eine Stufe fehl, werden alle vorher
   erzeugten CPU-, GPU- und Materialressourcen in umgekehrter Reihenfolge
   freigegeben.
5. Preparation synchron anbieten und Worker als separaten Adapter ergänzen.
   Bundler-/Worker-Protokoll bleibt aus dem R3F-Component heraus.
6. Einen `ThreeCameraAdapter` einführen, der Kamera und `coordinateRoot` in einen
   neutralen, allokationsarmen Framezustand für gemeinsames Culling und die
   Layer-Renderer übersetzt.
7. Einen kleinen `ThreeVegetationSceneAdapter` als Standardweg ergänzen. Er
   nimmt Renderer, Szene, Kamera und `coordinateRoot` entgegen, hängt das
   Runtime-Objekt ein und aus und delegiert Frameupdate sowie Cleanup. Er besitzt
   keine Szenenlichter und keine layerspezifische Konfiguration.

Gate:

- Standalone-Beispiel enthält keine manuelle
  Parser→Dataset→Culling→Adapter→View-Kette mehr.
- Fehler-Injektionstests prüfen Cleanup nach jeder Erzeugungsstufe.
- Tests prüfen transformierten `coordinateRoot`, Layer-Umschaltung und
  wiederholtes `dispose()`.
- Das Standalone-Beispiel benötigt weder manuelle Kameramatrix-Konvertierung
  noch einen eigenen Kamera- oder Licht-Synchronisationscallback.
- Ein Vertragstest ersetzt den Camera-Adapter, ohne Dataset oder Layerprofil zu
  ändern.

Commit: `refactor(webgl): add vegetation runtime lifecycle facade`

### Phase 5 – Layer-Renderer und GPU-Ressourcen modularisieren

Ziel: `WebGLGrassView` ist eine eingebaute Strategie, nicht der Runtime-Kern.

Arbeiten:

1. Gemeinsame VEGFILE-GPU-Ressourcen von Grass-Paletten, Patchtexturen,
   Geometry und Material trennen.
2. Eine grobe `LayerRendererFactory`-/Registry-Grenze definieren. Keine eigenen
   Interfaces für jede Hilfsfunktion.
3. Grass über diese Registry erzeugen; Layerwahl erfolgt über Profil und stabile
   Layer-ID, nicht über `campus-grass` im Lifecycle.
4. Ein kleines Dummy-/Anchor-Profil nur als Vertragstest verwenden. In dieser
   Phase werden keine produktiven Büsche oder Bäume implementiert.
5. Diagnostik über einen stabilen Snapshot bereitstellen, statt öffentliche
   interne Buffer und Materials zu benötigen.

Gate:

- Ein Test tauscht das Layerprofil ohne VEGFILE-Änderung aus.
- Gemeinsame GPU-Ressourcen und Profilressourcen werden jeweils genau einmal
  freigegeben.
- Bestehende Density- und Renderingtests bleiben grün.

Commit: `refactor(webgl): support replaceable layer renderers`

### Phase 6 – Three.js-Lichtadapter isolieren

Ziel: Einheitliche, konfigurierbare Reaktion auf Szenenlicht ohne parallele
Lichtquelle oder I-CAKA-spezifische Uniformbrücke.

Arbeiten:

1. Bestehende Three-Licht-, Shadow-, Tone-Mapping- und Color-Space-Anbindung in
   einen `ThreeSceneLightingAdapter` verschieben und als Default setzen.
   Der Adapter verwendet den nativen Three-Materialpfad (`lights: true`,
   Lichtuniforms und Shader-Chunks), statt Szenenlichter selbst zu suchen oder
   zu spiegeln.
2. `directLightWeight` beziehungsweise sein Nachfolgemodell bleibt pro
   Grass-Profil konfigurierbar.
3. Den versteckten Übergang des direkten Lichtanteils auf `1.0` aus dem
   Ground-Farbübergang lösen. Falls das aktuelle Bild ihn benötigt, wird
   dasselbe Verhalten über eine ausdrücklich konfigurierte Licht-Distanzkurve
   nachgebildet.
4. Normalenquelle explizit machen: rekonstruierte Ground-Normale als aktueller
   Standard, Geometrienormale oder Mischung als optionale Adaptereinstellung.
5. `castShadow` und `receiveShadow` aus einer Quelle anwenden; I-CAKA darf die
   Meshwerte nicht nochmals überschreiben.
6. Einen einfachen alternativen Testadapter implementieren, aber kein zweites
   produktives Lichtsystem.
7. Renderer-Exposure wird über Three.js Tone Mapping übernommen. Weder Runtime
   noch I-CAKA führen dafür ein paralleles Exposure-Uniform oder eine
   Frame-Synchronisation ein.

Technische Verifikation:

- Ambient-/Hemisphere- plus Directional-Light;
- wechselnde Farbe und Intensität ohne manuelle Synchronisation;
- Schatten an/aus;
- Tone Mapping und Exposure;
- Near/Far-Lichtreaktion;
- Shaderkompilierung über die tatsächlich von Vite ausgelieferte Library.

Gate:

- I-CAKAs `DayNightLighting` bleibt alleiniger Besitzer der Szenenlichter.
- Hinzufügen, Entfernen sowie Farb-/Intensitätsänderungen kompatibler
  Three-Lichter erreichen die Vegetation ohne Consumer-Callback.
- Placement, Density und VEGFILE kennen das Lichtmodell nicht.
- Ein Adapterwechsel benötigt keine Shaderänderung außerhalb des
  Lighting-Adapters.

Commit: `refactor(lighting): add three scene lighting adapter`

### Phase 7 – Ground-Adapter und schlanke I-CAKA-Einbindung

Ziel: I-CAKA enthält nur Campusentscheidungen und React/R3F-Lifecycle.

Pipeline:

1. Generisches Ground-Material-Patching mit vollständigem Restore/Dispose als
   Adapter bereitstellen.
2. Zielmaterialien beziehungsweise ein Materialprädikat, Albedo-Modus und
   Koordinatenbezug von der Anwendung entgegennehmen.
3. Horizontale Achsen aus dem Dataset verwenden; keine feste `.xz`-Projektion.

I-CAKA:

1. `CampusVegetation.tsx` auf Assetzustand, Runtime-Erzeugung, einen kleinen
   `useFrame`-Aufruf, Ready-Zustand und Dispose reduzieren.
2. `campus-grass`-Suchen aus dem Lifecycle entfernen.
3. Lambert-Konvertierung und Ground-Patch über denselben zentralen
   Campus-Surface-Binding-Adapter installieren und zurückbauen. Deaktivierte
   Vegetation verändert kein Ground-Material.
4. Debugpanel, URL-, DPR-, Shadow- und R3F-Eventsteuerung in ein optionales
   Development-Component verschieben.
5. Vegetationsobjekt und Modell unter dieselbe Transformationsgrenze hängen.

Gate:

- Deaktiviert: kein Fetch, kein Worker, keine GPU-Ressource, keine
  Materialänderung und keine Framearbeit.
- Aktiviert: vollständiges Cleanup bei Unmount, Assetwechsel und Fehler.
- Produktionscomponent enthält keine Debug-Renderübernahme.
- Pipeline-Produktionscode enthält keinen Campusnamen.

Commits:

1. `feat(webgl): add ground surface adapter`
2. `refactor(vegetation): use pipeline runtime facade` im I-CAKA-Repository.

### Phase 8 – Öffentliche Paketgrenzen und portable Entwicklung

Ziel: Installation funktioniert außerhalb der aktuellen Schwesterordner.

Arbeiten:

1. Kuratierte Exporte festlegen, zum Beispiel Root-Quickstart plus getrennte
   Subpaths für `runtime`, `webgl`, `profiles/grass`, `debug` und `node`.
2. Rohe Shader, GPU-Puffer und Debugimplementierung aus dem allgemeinen
   Root-Vertrag entfernen. Low-Level-Zugriff nur absichtlich über dokumentierte
   Subpaths anbieten.
3. Package-Version und Breaking-Change-Grenze festlegen; für den neuen
   Pre-1.0-Vertrag bietet sich `0.2.0` an.
4. CLI-Vertrag korrigieren: unterstützte Node-Version festlegen und klar
   entscheiden, ob veröffentlichte `.ts`-Configs wirklich unterstützt werden.
5. Ein sauberes Tarball bauen, in einem temporären Three.js-Verbraucher
   installieren und Root-/Node-Imports, CLI, Typecheck und Build prüfen.
6. I-CAKAs direkten Schwester-`dist`-Alias nur als expliziten lokalen
   Entwicklungsmodus behalten. User und Admin verwenden dafür einen gemeinsamen
   Vite-Helper. Normalbetrieb und CI verwenden die normale Paketauflösung.

Gate:

- Ein temporärer Verbraucher benötigt weder das Pipeline-Repository noch dessen
  Verzeichnisstruktur.
- Das Paket enthält keine stale Builddatei und keine Campus-/Privatassets.
- User- und Admin-Vite-Build funktionieren mit normaler Paketauflösung.

Commit: `build(package): make vegetation integration portable`

### Phase 9 – Dokumentation, Release-Gates und Abschluss

Ziel: Ein neuer Three.js-Verbraucher kann die Pipeline ohne Kenntnis der Interna
korrekt verwenden.

Arbeiten:

1. README mit Installation, Minimalbeispiel, Lifecycle, Worker-Variante,
   Layerprofilen, Lichtadapter, Ground-Adapter und Cleanup schreiben.
2. Runtime-Datenfluss als aktuelle Quelle pflegen. Abgeschlossene
   Implementierungspläne entfernen oder auf kurze Vertragsdokumentation
   reduzieren.
3. Roadmap nur mit tatsächlich offenen Themen führen.
4. `verify` um Clean-Build, Paket-Smoke-Test und automatisierten echten
   WebGL-Test ergänzen.
5. Separaten expliziten I-CAKA-Integrationstest dokumentieren; portabler
   Library-Test und Consumer-Test dürfen sich nicht gegenseitig verstecken.

Finale Gates:

- Pipeline: vollständige Tests, Typecheck, Clean-Build, Paketinstallation,
  CLI-/Export-Smoke-Test und echter Vite-WebGL-Test.
- I-CAKA: Tooling- und Vegetationstests, `vegetation:check`, Shared-Lint,
  User-/Admin-Typecheck und beide Produktionsbuilds.
- Benutzer: visuelle Abnahme für Licht, Schatten, Ground-Übergang und Density
  bei Tag/Dämmerung/Nacht sowie nah/mittel/fern.
- Saubere Arbeitsbäume in beiden Repositories.

Commits:

1. `docs: document the supported vegetation integration`
2. Korrekturen aus der finalen Verifikation jeweils als kleine, ursächliche
   Commits; kein Sammelcommit mit unabhängigen Änderungen.

## Bewusst außerhalb dieses Cleanups

- WebGPU-Backend;
- Occlusion-Culling gegen Gebäude;
- Wind und neue visuelle Features;
- produktive Baum-/Buschrenderer;
- neue VEGFILE-Version;
- Performance-Tuning ohne reproduzierbares Profiling.

Die neue Struktur soll diese Erweiterungen ermöglichen, aber der Cleanup darf
sie nicht vorweg implementieren.

## Reihenfolge und Stop-Regeln

- Phase 1 wird zuerst abgeschlossen und committed. Erst danach beginnt der
  Breaking Refactor.
- Jede Phase startet auf grünen Gates der vorherigen Phase und endet mit einem
  eigenen überprüfbaren Commit.
- Ändert ein Schritt das sichtbare Bild, ist er kein reiner Cleanup mehr und
  benötigt eine neue Benutzerabnahme.
- Ändert ein Schritt VEGFILE v1 oder deterministische IDs, wird er aus diesem
  Plan herausgenommen und separat geplant.
- Wenn ein Adapter nur einen bestehenden Funktionsaufruf weiterreicht und keine
  echte austauschbare Verantwortung besitzt, wird er nicht eingeführt.
