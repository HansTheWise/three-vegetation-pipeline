# Globale Vegetations-Patchfelder

## Verantwortung

Das rendererunabhängige Patchmodul erzeugt aus VEGFILE-Geometrie und
`layers[].patches` ein deterministisches globales RG8-Feld. Das Feld ist
modelllokal, statisch und unabhängig von Kamera, Chunk- und Render-Tile-Grenzen.

- R beschreibt die Patchabdeckung.
- G enthält die zum selben Feld gehörende Helligkeitsvariation.
- `baseColor` und `brightnessVariation` beschreiben die Ground-Albedo.

Das Feld ändert keine Terrainhöhe und keine Terrain- oder Vegetationsnormalen.
Es ist keine Normal-, Bump- oder Displacement-Map.

## Laufzeitvertrag

`createVegetationRuntimeDataset` erzeugt ein aktiviertes Feld einmalig. Das
Dataset kann zusammen mit vorbereiteten Active-Cell-Daten in einem Worker
entstehen und übertragbare Buffer an den Hauptthread zurückgeben.

`WebGLStaticVegetationResources` lädt dasselbe Feld einmal als lineargefilterte
RG-Textur mit Mipmaps hoch. Der Grassrenderer kann es für den konfigurierten
Ground-Farbübergang abfragen. Eine Hostanwendung kann dieselbe Textur über einen
Ground-Materialadapter verwenden. Es darf keinen zweiten unabhängigen
Ground-Noise-Pfad geben.

Die statische Grasszulassung stammt aus VEG-Maske und seedbasierter
Cell-Reihenfolge. `density.activeCells`, `activeAnchors` und `activeElements`
reduzieren die sichtbaren Kandidaten anschließend pro Render-Tile. Das
Patchfeld bevorzugt keine Patchkerne in der Distanz und erzeugt keine
wiederholten geometrischen Lochmuster.

## Konfiguration

- `seed` hält die Feldgenerierung reproduzierbar.
- `radiusMeters` begrenzt die Größe der Quellbereiche.
- `targetCoverage` legt die gewünschte Gesamtdeckung fest.
- `allowMerging` erlaubt zusammenhängende Bereiche.
- `edgeFalloffMeters` steuert sowohl weiche Einzelpatchränder als auch den
  Übergang zur Grundfarbe.
- `shapeDistortion` verformt die Patchbereiche räumlich.
- `colors.baseColor` und `colors.brightnessVariation` steuern ausschließlich
  die Albedo.

## Invarianten

1. Gleiche VEGFILE-, Layer- und Patch-Konfiguration erzeugt bitgleich dasselbe
   Feld.
2. Das Feld verläuft ohne Nähte über Chunk- und Render-Tile-Grenzen.
3. Cells außerhalb der VEG-Maske gelangen nie in die Active-Cell-Liste.
4. Reine Farbänderungen verändern keine Cell-, Anchor- oder Elementidentität.
5. Im stationären Frame entsteht keine CPU-Arbeit für die Patchgenerierung.
6. GPU-Textur und Materialbindung werden beim Cleanup vollständig freigegeben.

## Verifikation

Unit-Tests prüfen Determinismus, Seedänderung, Radiusgrenzen, Zielabdeckung,
Verschmelzung, Randabfall, globale Koordinaten und Farbsampling. Der echte
WebGL-Check kompiliert Grass- und Ground-Shader über die ausgelieferte
Vite-Integration. Die visuelle Beurteilung von Form, Farbharmonie und Übergängen
bleibt Aufgabe des Benutzers.
