# WebGL-Grasansicht

`WebGLGrassView` zeichnet nur Kandidaten aus sichtbaren Render-Tiles. Beim
Aufbau erzeugt `VegetationRenderTileDensity` aus der Vegetationsmaske eine
kompakte, deterministisch geordnete Liste aktiver Cells. Maskeninaktive Cells
starten deshalb keinen Vertex-Shader mehr.

Die Ansicht ist der eingebaute Renderer für `renderProfile.type: 'grass'` und
wird von `WebGLGrassLayerRendererFactory` erzeugt. Ihre
`WebGLGrassLayerResources` besitzen Patterntextur, untere und obere
Farbpalette sowie das optionale Ground-Patch-Feld. Der gemeinsame Adapter
enthält dagegen nur VEGFILE- und Chunk-Sichtbarkeitsdaten. `dispose()` gibt
alle Grass-eigenen Buffer, Texturen, Geometrien und Materialien frei.
Über `groundPatchSurface` kann dieselbe Textur zusätzlich auf ausgewählte
Three.js-Lambert-/Standardmaterialien projiziert werden. Installation,
Shaderpatch und Restore gehören dabei vollständig zum Grass-Renderer.

## Frame-Ablauf

```text
sichtbare Chunks
→ minimale Kameraentfernung je aktivem Render-Tile
→ Cell-, Anchor- und Elementkurve
→ drei ganzzahlige Tile-Budgets
→ exakte sichtbare Halmzahl
→ kleinster ausreichender Zweierpotenz-Bucket
```

Die Tile-Records aller Buckets werden zusammenhängend in genau eine
`RGBA32UI`-Textur hochgeladen. Jeder Bucket besitzt einen instanzierten Draw mit
Kapazität `1, 2, 4, 8, ...`. Ein Tile mit 790 sichtbaren Halmen verwendet daher
den 1024er-Bucket. Kandidaten ab 790 beenden den Vertex-Shader unmittelbar;
der Bucket-Overhead bleibt kleiner als Faktor zwei. Tiles mit Nullbudget
gelangen in keinen Draw.

## Kandidatenzuordnung

Die Elementkandidaten werden ohne Cell-Schleifen arithmetisch verteilt:

```text
Kandidatenindex
→ aktiver Anchor-Rang
→ Cell-Präfixindex und Anchorindex
→ Elementindex
→ vorberechneter maskenaktiver lokaler Cell-Index
```

Damit bleibt eine niedrigere Dichte ein stabiler Präfix der höheren Dichte.
Pattern, Rotation, Spiegelung, Halmform und Farben verwenden weiterhin die
stabilen Cell-/Anchor-/Element-Hashes.

## Renderqualität und Beleuchtung

Alle Buckets verwenden `blade.segments` und `blade.heightSampling`. Es gibt
keinen Geometrie-LOD-Wechsel und kein Wachstum versteckter Halme unter dem
Boden. `ThreeSceneLightingAdapter` verbindet die Materialien standardmäßig mit
Three.js-Szenenlicht, eingehenden Schatten, Tone-Mapping, Renderer-Exposure und
Ausgabefarbraum. `createWebGLGrassLayerRenderer({ lighting })` kann diesen
technischen Materialpfad ersetzen, ohne Grass-Placement oder Density zu ändern.

Der Shader leitet die lokale Bodennormale ohne weitere Texturzugriffe aus den
vier bereits für die bilineare Höhe gelesenen Heightmap-Werten ab. Sie ist die
Standard-Normalenquelle. `geometry` verwendet stattdessen die sichtbare
Halmfläche; `mixed` blendet beide anhand von `groundWeight`. Nur diese beiden
Varianten aktivieren die zusätzliche Fragmentableitung.

`lighting.directLightWeight` und `indirectLightWeight` begrenzen direkte und
indirekte Anteile. `lighting.distanceTransition` kann beide Werte unabhängig
vom Farbverlauf über Entfernung und Halmhöhe verändern. Sonnenfarbe,
Intensität und eingehende Schatten bleiben erhalten.

Zwischen `blade.cameraFacing.startsAtMeters` und `reachesFullAtMeters` richtet
der Vertex-Shader Breiten- und Höhenachse weich zur Kamera aus. Nahe Halme
behalten ihre zufällige Ausrichtung; entfernte Halme maximieren ihre projizierte
Fläche, ohne zusätzliche Kandidaten oder Draws zu erzeugen.

Die Diagnostik trennt `visibleCandidateCount` als tatsächlich sichtbare
Halmzahl von `executedCandidateCount` als inklusive Bucket-Padding gestartete
Vertex-Kandidaten.
