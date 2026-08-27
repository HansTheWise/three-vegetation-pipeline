# WebGL-Grasansicht

`WebGLGrassView` zeichnet einen einfachen Low-Poly-Halm für jeden Kandidaten
der aktiven Render-Tiles eines Vegetationslayers. Ein rendererunabhängiges
Tile-LOD sortiert nur aktive Tiles in wiederverwendete Distanz-Buckets. Jeder
Bucket verarbeitet ein konfiguriertes, deterministisches Cell-Präfix und
erzeugt keine CPU-Liste einzelner Anchor oder Halme.

## Geometrie

Ein Halm besitzt drei horizontale Vertex-Reihen:

```text
Spitze:  4 ----- 5
          \     /
Mitte:   2 ----- 3
          \     /
Wurzel:  0 ----- 1
```

Die sechs Vertices bilden zwei vertikale Segmente und vier Dreiecke. Das
Fern-LOD verwendet nur Wurzel und Spitze und damit vier Vertices und zwei
Dreiecke. Höhe, Breite, Neigung und Ausrichtung werden im Vertex-Shader
verändert.

## GPU-Platzierung

Jeder LOD-Bucket besitzt einen instanzierten Draw. Der Instanzindex wird im
Shader zerlegt:

```text
gl_InstanceID
→ sichtbares Render-Tile
→ Index im stabilen Cell-Präfix
→ deterministisch permutierte lokale Cell im Tile
→ progressiver Anchorindex
→ progressiver Elementindex beziehungsweise Halm
```

Leere Tiles gelangen nicht in einen Draw. Die Cell-Permutation ist vollständig,
enthält keine Wiederholungen und bleibt zwischen den LOD-Stufen präfixstabil.
Danach liest der Shader weiterhin das Maskenbit der ausgewählten Cell. Aktive
Kandidaten verwenden Cell-Hash, Pattern, Rotation und Spiegelung. Der
Element-Hash steuert Halmform; sein Detail-Hash steuert Wurzelversatz und
Farben. LOD verändert keine dieser Identitäten.

Die Halmwurzel wird aus Cell und normalisiertem Pattern-Anchor berechnet. Der
Elementversatz bleibt innerhalb der Cell. Nah und mittel werden vier
quantisierte Heightmap-Texel in das Chunk-Höhenintervall zurückgerechnet und
bilinear interpoliert. Das Fern-LOD mittelt stattdessen zwei diagonal
gegenüberliegende Texel. Erst danach entsteht über die konfigurierten Achsen
die modelllokale 3D-Position.

## Distanzverhalten

`bladeCount` definiert eine normalisierte Exponentialkurve. Aus ihr entstehen
die Übergangsdistanzen der progressiven Cell-, Anchor- und Elementpräfixe.
Ein stabiler Hash verteilt den individuellen Zeitpunkt, an dem Cells oder
Anchor innerhalb von `growthTransitionDistanceMeters` in den Boden wachsen.
Dadurch verschwindet nicht mehr ein kompletter Tile-Ring gleichzeitig. Die
exakte Halmdistanz steuert außerdem Dicke und den multiplikativen
Nah-/Fernfarbverlauf. Die Distanzfarbe beginnt mit der normalen Halmfarbe und
nähert sich ausschließlich dem konfigurierten Fernfarbton.

## Aktuell verwendete Configwerte

- `pattern`: Patternanzahl, Anchorzahl, Rotation und Spiegelung;
- `blade`: Höhen- und Breitenintervall, Spitzenbreite und maximale Neigung;
- `lod`: Render-Tile-Größe sowie Cell-, Anchor-, Element-, Geometrie- und Höhenprofil jeder Stufe;
- `bladeCount`: Halmzahl, Exponentialkurve, Übergang und Wurzelversatz;
- `bladeThicknessDistanceScaling`: distanzabhängige Halmstärke;
- `colors`: Paletten, vertikaler Übergang und Nah-/Fernfarbton;
- `lighting.normalUpBias`: Ausrichtung der einfachen stilisierten Beleuchtung.

Die Anwendung übergibt Richtung und Farben ihres Ambient- und
Directional-Lichts an alle Gras-LOD-Materialien. Dadurch reagieren Campusmodell
und Gras auf dieselbe Szenenbeleuchtung, obwohl der Grasrenderer sein eigenes
Low-Poly-Material behält.

Kameraausrichtung, Schattenempfang und Wind sind noch nicht Teil dieser
Ansicht. Das ICAKA-Gras soll Szenenschatten empfangen, aber selbst nie in eine
Shadowmap zeichnen.
