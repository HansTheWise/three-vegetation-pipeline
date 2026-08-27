 

# Implementierungsroadmap

Stand: 26. August 2026

## Zielbild

Die Pipeline soll Vegetationsflächen einmalig aus einem Modell extrahieren und
zur Laufzeit rendererunabhängig beschreiben. WebGL und später WebGPU übernehmen
nur GPU-Ressourcen und Rendering. Das VEGFILE bleibt dabei ein Datenformat und
wird nicht an ein bestimmtes GPU-Bufferlayout gekoppelt.

## Aktueller Stand

| Bereich                          | Status                  | Vorhanden                                                                                                         |
| -------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Offline-Reader                   | Fertig für v1          | GLB-Lesen, Modelltransformationen, neutrale Dreiecksprimitive, explizite Ablehnung nicht unterstützter Mesharten |
| Offline-Extraktion               | Fertig für v1          | Chunk-Grid, Heightmaps, Layer-Masken, Steigungsfilter und stabiler Seed                                           |
| VEGFILE-Writer und Compiler      | Fertig für v1          | Binärformat, Quantisierung, Bitpacking, CRC32, Build-Fingerprint, CLI und atomarer Dateiaustausch                |
| Runtime-Parser                   | Fertig für v1          | Vollständige Formatvalidierung und typisierte Ansichten ohne unnötiges Expandieren                              |
| Runtime-Dataset                  | Fertig                  | Strikte Verbindung von Parserdaten und Runtime-Config sowie einmalige Patternerzeugung                            |
| Chunk-Frustum-Culling            | Fertig                  | Modelllokale Chunk-Boxen und wiederverwendetes Visible-Chunk-Array                                                |
| WebGL-GPU-Adapter                | Fertig als Datenadapter | Einmalige statische Uploads und aktualisierbarer Visible-Chunk-Buffer                                             |
| Patterns und stabile IDs         | Grundlage fertig        | Progressive Anchor-Patterns sowie Cell-, Anchor- und optionale Element-Hashes für CPU und GLSL                   |
| Debugdarstellung                 | Fertig                  | Heightmap-Flächen, Cell-Masken, Pattern-Anker, Chunk-Boxen, Frustum und Testkamera                               |
| Produktives Vegetationsrendering | Statische Grundlage fertig | Dichte GPU-Platzierung, bilineare Höhe und einfacher deterministischer Low-Poly-Grasshader                       |
| Automatisches LOD                | Offen                   | Vorhandene Anchor-Präfixe werden bisher nur manuell in der Debugansicht ausgewählt                              |
| Occlusion-Culling                | Offen                   | Verdeckung durch Szenengeometrie wird noch nicht ausgewertet                                                      |
| WebGPU-Adapter                   | Offen                   | Wird nach dem stabilen WebGL-Rendervertrag umgesetzt                                                              |

Die Datenflüsse sind separat in
[`src/offline/offline-pipeline.md`](src/offline/offline-pipeline.md) und
[`src/runtime/runtime-pipeline.md`](src/runtime/runtime-pipeline.md) beschrieben.

## Nächste Implementierungsschritte

### 1. Generischen Rendervertrag festlegen

Noch zu implementieren:

- festlegen, welche Daten ein Vegetationslayer dem Renderer übergibt;
- Cell, Anchor und optionales Element als rendererunabhängige Hierarchie
  beibehalten;
- die derzeit grasspezifischen Runtime-Bereiche wie `blade`, `bladeCount` und
  `lod.levels` in einen klaren Renderprofil-Vertrag
  einordnen, ohne das VEGFILE grasspezifisch zu machen;
- Anchor- und Element-Bits erst zusammen mit konkreten Verbrauchern in
  `AnchorHashLayout.ts` und `ElementHashLayout.ts` vergeben;
- CPU- und GLSL-Referenztests für jede neue Bitbelegung ergänzen.

Abnahmekriterium: Ein Layer kann einen Baum oder Busch direkt pro Anchor und
Gras mit mehreren Elementen pro Anchor beschreiben, ohne das VEGFILE-Format zu
ändern.

### 2. Minimalen produktiven WebGL-Renderer erstellen

In der ersten statischen Version umgesetzt:

- aktive Cells aus den bitgepackten Layer-Masken verarbeiten;
- pro Cell Pattern, Rotation und Spiegelung aus dem Cell-Hash bestimmen;
- Pattern-Anker in Cell- und anschließend Modellkoordinaten umrechnen;
- die Höhe eines Anchors aus der Chunk-Heightmap interpolieren;
- Anchor- und Element-Hashes im Shader ableiten;
- sechs Vertices und vier Dreiecke pro Low-Poly-Halm zeichnen;
- Renderer pro aktiviertem Layer erzeugen und Ressourcen sauber freigeben.

Der Renderer verwendet bereits Höhe, Breite, Neigung, Ausrichtung, Wurzelversatz,
Farbpaletten und einfache Beleuchtung aus der Runtime-Config. Distanzverhalten,
Wind, Schatten und Kameraausrichtung folgen in den späteren Schritten.

Abnahmekriterium: Die Testansicht zeichnet an allen aktiven Pattern-Ankern echte
Platzhalterinstanzen auf der rekonstruierten Höhe und reagiert korrekt auf das
Visible-Chunk-Array.

### 3. Distanzsichtbarkeit und automatisches LOD implementieren

Noch zu implementieren:

- Kameradistanz in Meter im Modellkoordinatensystem bestimmen;
- `visibility.maximumDistanceMeters` pro Layer anwenden;
- die bereits progressiv sortierten Anchor-Präfixe automatisch auswählen;
- optionale Elemente pro Anchor mit der Entfernung reduzieren;
- Geometrie-LOD anhand der konfigurierten Segmentstufen auswählen;
- Übergangsbereiche oder deterministisches Dithering gegen sichtbares Aufpoppen
  definieren;
- die LOD-Entscheidung ohne neue Arrays pro Frame bereitstellen.

Die maximale Renderdistanz bleibt bewusst Teil der Layer- und LOD-Logik. Das
rendererunabhängige Frustum-Culling prüft weiterhin nur, ob ein Chunk das
Kamerafrustum schneidet.

Abnahmekriterium: Anchorzahl, Elementzahl und Geometriedetail ändern sich
automatisch und reproduzierbar mit der Kameradistanz.

### 4. Occlusion-Culling ergänzen

Noch zu entscheiden und zu implementieren:

- den Tiefeninput der Hauptszene als explizite Schnittstelle definieren;
- zunächst konservatives Occlusion-Culling ganzer Chunks implementieren;
- verzögerte Ergebnisse und zeitliche Stabilisierung berücksichtigen, damit
  Chunks nicht flackern;
- Cell-Occlusion nur ergänzen, wenn Messungen nach Chunk-Culling und LOD noch
  einen relevanten Nutzen zeigen;
- Frustum-, Distanz- und Occlusion-Ergebnis in eine gemeinsame Renderarbeitsliste
  überführen, ohne die einzelnen Systeme fest miteinander zu koppeln;
- WebGL-spezifische Tiefen- oder Hierarchie-Ressourcen im WebGL-Adapter halten.

Occlusion folgt erst auf den minimalen Renderer. Dadurch stehen echte
Geometrie, Szenentiefe und messbare Draw-Kosten zur Verfügung.

Abnahmekriterium: Vollständig verdeckte Chunks erzeugen keine Vegetationsarbeit;
bei unsicheren Ergebnissen bleibt das Verfahren konservativ und rendert den
Chunk weiter.

### 5. Produktiven Vegetationsshader fertigstellen

Noch zu implementieren:

- Geometrieform, Höhe, Breite, Neigung und optionale Unterelemente;
- deterministische Auswahl der konfigurierten Farben;
- vertikaler Farbverlauf und entfernungsabhängige Farbanpassung;
- entfernungsabhängige Dicke und Segmentzahl;
- Kameraausrichtung für flache Blickwinkel und Draufsicht;
- Wind, Böen und räumliche Variation;
- Beleuchtungsnormalen, Schattenempfang und begrenztes Schattenwerfen;
- konsistente Nutzung der Anchor- und Element-Hashlayouts.

Abnahmekriterium: Alle tatsächlich unterstützten visuellen Runtime-Configwerte
werden vom Shader konsumiert und besitzen Tests oder eine nachvollziehbare
Debugdarstellung.

### 6. Öffentliche Runtime-Steuerung und ICAKA-Integration

Noch zu implementieren:

- Laden der `.veg`-Bytes und Fehlerweitergabe in der Anwendung;
- Lebenszyklus für Parserdaten, Dataset, Culling, Adapter und Renderer bündeln;
- Modellmatrix, aktive Kamera und Szenentiefe pro Frame übergeben;
- Layer aktivieren und deaktivieren, ohne statische Daten neu zu parsen;
- Build-Fingerprint optional gegen die erwartete Assetversion prüfen;
- vollständiges Freigeben aller CPU- und GPU-Ressourcen;
- Integration in den ICAKA-Renderloop und Verhalten bei Assetwechsel testen.

Abnahmekriterium: ICAKA kann die Pipeline über eine kleine öffentliche API
initialisieren, pro Frame aktualisieren und vollständig entfernen.

### 7. WebGPU-Adapter ergänzen

Noch zu implementieren:

- denselben Runtime-Dataset- und Rendervertrag auf WebGPU-Ressourcen abbilden;
- statische Uploads und veränderliche Frame-Daten wie im WebGL-Adapter trennen;
- WGSL-Funktionen für dieselben stabilen Hashes und Bitlayouts bereitstellen;
- Sichtbarkeits- und Renderausgaben zwischen beiden Backends vergleichen.

Abnahmekriterium: WebGL und WebGPU erzeugen für denselben Seed, dieselbe Cell und
dieselben Indizes dieselben Pattern-, Anchor- und Elemententscheidungen.

### 8. Performance- und Qualitätsgrenzen messen

Noch zu implementieren:

- Referenzszenen für kleine, mittlere und maximale Vegetationsdichte festlegen;
- CPU-Zeit für Culling und Frame-Uploads messen;
- GPU-Zeit, Draw Calls, sichtbare Chunks, Cells, Anchor und Elemente erfassen;
- Speicherverbrauch der statischen und dynamischen GPU-Ressourcen dokumentieren;
- Grenzfälle wie leere Layer, Kartenränder und Kamerasprünge testen;
- Performanceziele für ICAKA festlegen und gegen beide Backends prüfen.

Abnahmekriterium: Optimierungen werden anhand reproduzierbarer Messwerte statt
nur anhand der sichtbaren Bildrate bewertet.

## Spätere Offline-Erweiterungen

Für den nächsten Runtime-Schritt ist keine weitere Offline-Funktion erforderlich.
Diese Erweiterungen werden nur bei einem konkreten Asset- oder Formatbedarf
angegangen:

- Instanced Meshes, Skinned Meshes oder Morph Targets im Reader unterstützen;
- mehrere vertikale Heightmap-Ebenen oder Überhänge in einer neuen
  Extraktions- und VEGFILE-Version repräsentieren;
- zusätzliche ModelReader für andere Quellformate bereitstellen;
- Migrationen zwischen späteren VEGFILE-Versionen definieren.
