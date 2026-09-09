# WebGL-Grasansicht

`WebGLGrassView` zeichnet nur Kandidaten aus sichtbaren Render-Tiles. Beim
Aufbau erzeugt `VegetationRenderTileDensity` aus der Vegetationsmaske eine
kompakte, deterministisch geordnete Liste aktiver Cells. Maskeninaktive Cells
starten deshalb keinen Vertex-Shader mehr.

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
Boden. Die Materialien beziehen Three.js-Szenenlicht, eingehende Schatten,
Tone-Mapping und Ausgabefarbraum direkt ein.

Der Shader leitet die lokale Bodennormale ohne weitere Texturzugriffe aus den
vier bereits für die bilineare Höhe gelesenen Heightmap-Werten ab. Direktes und
indirektes Licht reagieren damit auf die Bodensteigung, aber nie auf die
zufällige Ausrichtung der zweidimensionalen Halmfläche.

`lighting.directLightWeight` begrenzt den direkten Sonnenanteil des nahen
Grases. Während einer Bodenfarben-Transition nähert er sich zusammen mit der
Halmfarbe dem vollen Lambert-Anteil des Bodenmaterials. Sonnenfarbe,
Intensität und eingehende Schatten bleiben erhalten.

Zwischen `blade.cameraFacing.startsAtMeters` und `reachesFullAtMeters` richtet
der Vertex-Shader Breiten- und Höhenachse weich zur Kamera aus. Nahe Halme
behalten ihre zufällige Ausrichtung; entfernte Halme maximieren ihre projizierte
Fläche, ohne zusätzliche Kandidaten oder Draws zu erzeugen.

Die Diagnostik trennt `visibleCandidateCount` als tatsächlich sichtbare
Halmzahl von `executedCandidateCount` als inklusive Bucket-Padding gestartete
Vertex-Kandidaten.
