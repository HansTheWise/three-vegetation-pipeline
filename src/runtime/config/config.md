# Runtime-Config

Die Runtime-Config enthält ausschließlich serialisierbare, tatsächlich
anpassbare Vegetationswerte. Sie enthält keine Algorithmen, Shader oder
Modulreferenzen.

`createVegetationRuntimeDataset` verbindet jede stabile `.veg`-Layer-ID mit
der Runtime-Config. Dabei erhält jedes spätere Modul nur den benötigten
Config-Abschnitt:

```text
.veg layer 0 + runtimeConfig.layers[0]
                 |
                 +-> Visibility-Modul erhält visibility
                 +-> Render-Tile-LOD erhält lod
                 +-> Pattern-Modul erhält pattern
                 +-> Halmzahl-Modul erhält bladeCount
                 +-> Shader erhält blade, colors, lighting, shadows und wind
```

Für den ersten Gras-Renderer gilt:

```text
aktive Cell
└── pattern.anchorsPerCell Anchor als Büschelmittelpunkte
    └── bladeCount.maximumPerAnchor einzelne Halme
```

`lod.renderTileSizeCells` begrenzt die Kantenlänge eines Render-Tiles in Cells.
Das ICAKA-Profil verwendet 32 Cells beziehungsweise 8 Meter pro Tile und acht
progressive LOD-Stufen. `lod.levels` enthält pro Stufe Cell-Abdeckung,
Anchorzahl, Elementzahl, Segmentzahl und Höhensampling. Die Dichte fällt zuerst
über vier, drei, zwei und einen Anchor. Danach sinkt die Cell-Abdeckung auf
50 %, 25 %, 12,5 % und 1,5625 %. Die zugehörigen Distanzen entstehen aus der
exponentiellen `bladeCount`-Kurve.

`bladeCount.maximumOffsetMeters` begrenzt den radialen Abstand einer Halmwurzel
von ihrem Anchor. Der Shader hält den versetzten Punkt innerhalb der zugehörigen
Cell. Das aktuelle ICAKA-Profil verwendet vier progressive Anchor pro Cell,
einen Halm pro Anchor und höchstens 0,02 Meter Wurzelversatz.

`bladeCount.lodTransitionStartVisibleRatio` legt fest, welcher Anteil eines neu
zugelassenen Halms am äußeren Rand seiner LOD-Stufe bereits über dem Gelände
sichtbar ist. Der Halm behält dabei seine volle Länge und wird als Ganzes aus
dem Boden gefahren. Das ICAKA-Profil startet bei 25 %; die Dauer des schnellen,
deterministisch versetzten Übergangs steuert
`bladeCount.growthTransitionDistanceMeters`.

Nahe und mittlere Low-Poly-Halme verwenden zwei Segmente. Wurzel, Mitte und
Spitze bestehen jeweils aus einer linken und einer rechten Ecke. Daraus
entstehen sechs Vertices und vier Dreiecke. Die Ferngeometrie besteht nur aus
einem Streifen mit vier Vertices und zwei Dreiecken.

Dadurch bleiben die Daten von ihrer Verarbeitung getrennt. Ein interner
Algorithmuswechsel verändert die Config nicht. Benötigt ein neues Modul weitere
anpassbare Eingaben, werden nur die zugehörigen Daten und ihr Typ ergänzt.

`validateVegetationRuntimeConfig` prüft die Daten einmal vor der Verwendung. Es
verhindert unter anderem doppelte Layer-IDs, ungültige Entfernungsintervalle,
negative Wurzelversätze, unvollständige Geometriestufen und Farbpaletten mit
mehr als 256 Einträgen.
