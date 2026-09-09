# Runtime-Config

Die Runtime-Config enthält ausschließlich serialisierbare Vegetationswerte.
Algorithmen, Shader und Three.js-Ressourcen bleiben in der Pipeline.
Asset-URLs, Ladezustand und globale Anwendungsschalter gehören dem Consumer und
sind kein Teil dieses Vertrags.

## Maximale Verteilung

`distribution` definiert die maximale Vegetation je maskenaktiver Cell:

```ts
distribution: {
  anchorsPerCell: 4,
  elementsPerAnchor: 1,
  elementRadiusMeters: 0.02,
},
```

Die Pattern-Erzeugung legt genau diese maximale Anchor-Anzahl einmalig an.
Aktive Teilmengen verändern Patternpositionen und Identitäten nicht.

## Boden-Patches

`patches.ground` ist ein Pflichtbereich jedes Runtime-Layers. Es verändert nur
die Bodenfarbe und den Distanzübergang der Halmfarben:

```ts
patches: {
  ground: {
    enabled: true,
    seed: 0,
    radiusMeters: { minimum: 8, maximum: 32 },
    targetCoverage: 0.65,
    allowMerging: true,
    edgeFalloffMeters: 3,
    shapeDistortion: 0.35,
    colors: {
      baseColor: '#39a83a',
      brightnessVariation: 0.08,
    },
  },
},
```

Das Feld entsteht einmal beim Dataset-Aufbau. Ein Consumer kann die Erzeugung in
einem Worker ausführen und dasselbe RG-Feld für Bodenfarbe und
Halmfarbübergang verwenden.
Hohe Zielabdeckung kann bei
`allowMerging: false` unerreichbar sein; das Feld weist `achievedCoverage` aus.

`edgeFalloffMeters` steuert sowohl den Abdeckungsrand als auch das Einblenden
einzelner Patchfarben. Überlappende Patches mischen ihre Farbanteile; am äußeren
Rand läuft die Variation zur `colors.baseColor` aus. Bei `0` sind diese Ränder
hart (abgesehen von der Texturfilterung). Die Meterbreite gilt vor der lokalen
Dehnung durch `shapeDistortion`; `brightnessVariation` bestimmt nur den Kontrast.

## Kontinuierliche Tile-Dichte

`activeCells` steuert zugleich die seedbasierte Gras-Coverage. Bei `ratio: 0.8`
werden pro Tile exakt rund 80 Prozent seiner VEG-maskenaktiven Cells gewählt.
Die vorbereitete Reihenfolge wird aus Seed, Layer und räumlicher Tile-Koordinate
deterministisch gemischt. Niedrigere Budgets bleiben Präfixe dieser Reihenfolge;
es entstehen weder neue Zufallsmuster noch geometrische Lochschablonen.

`density` ersetzt diskrete LOD-Profile durch drei unabhängig konfigurierbare,
monoton fallende Kurven:

```ts
density: {
  renderTileSizeCells: 32,
  activeCells: [
    { distanceMeters: 0, ratio: 1 },
    { distanceMeters: 126, ratio: 0.568 },
    { distanceMeters: 500, ratio: 0 },
  ],
  activeAnchors: [
    { distanceMeters: 0, ratio: 1 },
    { distanceMeters: 127, ratio: 0.345 },
    { distanceMeters: 500, ratio: 0 },
  ],
  activeElements: [
    { distanceMeters: 0, ratio: 1 },
    { distanceMeters: 220, ratio: 1 },
    { distanceMeters: 500, ratio: 0 },
  ],
},
```

Die Pipeline interpoliert linear zwischen den Punkten. Jede Kurve beginnt bei
Distanz `0`, ihre Distanzen steigen strikt und ihre Anteile dürfen mit der
Distanz nicht wachsen. Spätestens an `visibility.maximumDistanceMeters` muss
mindestens eine Kurve null erreichen, damit kein harter äußerer Render-Ring
entsteht.

Pro sichtbarem Render-Tile entstehen drei ganzzahlige Budgets:

```text
maskenaktive Cells × activeCells
→ aktive Cells × anchorsPerCell × activeAnchors
→ aktive Anchors × elementsPerAnchor × activeElements
```

Die Rundung erfolgt einmal pro Tile, nicht pro Cell. Dadurch bildet zum Beispiel
eine Anchor-Dichte von `0.345` über das ganze Tile den gewünschten Mittelwert,
statt jede Cell auf dieselbe höhere Anchor-Anzahl aufzurunden.

## Feste Renderqualität

Geometrie und Höhensampling sind keine Dichtewerte und stehen deshalb direkt in
`blade`:

```ts
blade: {
  segments: 2,
  heightSampling: 'bilinear',
  cameraFacing: {
    startsAtMeters: 80,
    reachesFullAtMeters: 140,
  },
  // Formwerte ...
},
```

Alle Dichte-Buckets verwenden dieselbe Qualität. Separate, sichtbare
Geometrie-LOD-Stufen existieren nicht. `cameraFacing` blendet die zufällige
Halmausrichtung im angegebenen Distanzbereich weich zu einer vollständig zur
Kamera ausgerichteten Fläche über. Die Dichtebudgets bleiben davon unberührt.

Weitere unabhängige Bereiche sind `visibility`, `pattern`,
`bladeThicknessDistanceScaling`, `colors`, `lighting` und `shadows.receive`.

`lighting.directLightWeight` legt den Anteil des gerichteten Sonnenlichts für
nahes Gras fest (`0` bis `1`). Die Beleuchtung nutzt die aus der Heightmap
rekonstruierte Bodennormale und ignoriert die zufällige Flächenausrichtung jedes
einzelnen Halms. Bei einer Bodenfarben-Transition nähert sich der Anteil zusammen
mit der Farbe dem vollen Lambert-Licht des Bodens.

## Distanzübergang zur Bodenfarbe

Bei aktivem `patches.ground` kann die Fernfarbtönung durch die lokale
Boden-Grundfarbe ersetzt werden:

```ts
distanceColorTransition: {
  target: 'ground',
  bottom: { startsAtMeters: 30, endsAtMeters: 120, curveStrength: 1 },
  top: { startsAtMeters: 60, endsAtMeters: 180, curveStrength: 1 },
},
```

`bottom` und `top` steuern Wurzel- und Spitzenfarbe unabhängig. Vor dem Start
bleibt die jeweilige Palette erhalten; ab dem Ende entspricht sie vollständig
der Boden-Grundfarbe an der Halmwurzel, einschließlich Patch-Helligkeit.
`curveStrength: 0` ist linear; größere Werte nähern die Farbe früher im
Distanzbereich an das Ziel an. Ende muss größer als Start sein. Es handelt
sich um Kameraentfernung in Metern, nicht um eine zeitliche Animation.

Der vertikale Farbverlauf mischt anschließend die beiden angepassten Farben.
Szenenlicht, Normalen, Dichte und Sichtweite bleiben unverändert. Gleiche
Grundfarbe bedeutet deshalb nicht zwingend gleiche beleuchtete Pixelfarbe.
Die RG8-Bodentextur wird im Vertex-Shader an der Wurzel auf Mip-Level 0 gelesen;
der Boden kann bei starker Verkleinerung durch seine Mipmaps stärker mitteln.
Es entstehen keine neue Textur und kein zusätzlicher Draw. Die bestehende
`farTint`-Konfiguration bleibt für Verbraucher ohne Bodenübergang gültig;
beide Modi werden nicht miteinander multipliziert.

Runtime-Schema **2** ersetzt den prototypischen Stufenvertrag, ohne das
VEGFILE-Format zu ändern. Eine erneute Vegetationsextraktion ist nicht nötig.
