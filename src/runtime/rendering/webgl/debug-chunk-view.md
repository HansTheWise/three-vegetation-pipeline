# WebGL-Debugansicht für sichtbare Chunks

`WebGLDebugChunkView` ist ein austauschbarer Test-Renderer für die Runtime-
Pipeline. Er erzeugt eine der Heightmap folgende instanziierte Fläche und
zeichnet davon eine Instanz pro aktuell sichtbarem Chunk.

Der Vertex-Shader liest für jede Instanz:

1. den gespeicherten Chunkindex aus `visibleChunkIndices`;
2. dessen Gridkoordinate aus `storedChunkGridCoordinates`;
3. dessen quantisierte Heightmap und Höhenintervall.

Der Fragment-Shader liest die bitgepackte Vegetationsmaske und zeigt das
Cell-Raster. Aktive Cells erhalten deterministisch ein Pattern, eine Rotation
und eine Spiegelung. Farbige Punkte markieren die Anker in Indexreihenfolge.

```ts
const runtimeDataset = createVegetationRuntimeDataset(parsedVegFile, runtimeConfig);
const gpuAdapter = new WebGLVegetationAdapter(renderer, runtimeDataset);
const debugChunks = new WebGLDebugChunkView(gpuAdapter);
scene.add(debugChunks.mesh);

// Der Adapter wird wie gewohnt vor dem Rendern aktualisiert.
gpuAdapter.updateVisibleChunks(visibleChunkIndices, visibleChunkCount);

// Beim Entfernen der Ansicht:
debugChunks.dispose();
```

Ein anderer Shader kann über die Option `shader` eingesetzt werden. Er muss
denselben Uniform-Vertrag verwenden, solange er mit dieser Debugansicht
verbunden bleibt.

Der lokale Browser-Test liegt unter `examples/webgl-debug-chunks.html`. Mit
dem Queryparameter `?near` startet er in einer Nahansicht, in der nur ein Teil
der Vegetations-Chunks das Kamera-Frustum schneidet. Die Nahansicht richtet sich auf
den gespeicherten Chunk mit den meisten aktiven Cells und zeigt standardmäßig
die produktive Grasansicht.

Die Testansicht wird aus dem Repository-Stamm gestartet:

```sh
npm run debug:webgl
```

Danach kann `http://127.0.0.1:5173/examples/webgl-debug-chunks.html?near`
geöffnet werden. Falls Vite einen anderen Port meldet, muss dieser Port in der
Adresse verwendet werden.

Die Zeichenfläche verwendet standardmäßig die physische Browserauflösung über
`window.devicePixelRatio`. Für reproduzierbare Vergleiche kann die horizontale
Auflösung festgelegt werden; das Seitenverhältnis folgt weiterhin dem Fenster:

```text
http://127.0.0.1:5173/examples/webgl-debug-chunks.html?resolution=2k
http://127.0.0.1:5173/examples/webgl-debug-chunks.html?resolution=4k
```

Antialiasing ist standardmäßig deaktiviert: Bei hoher physischer Auflösung kostet
es auf schwächeren integrierten GPUs erheblich mehr als es im Low-Poly-Bild
verbessert. `&aa` aktiviert es für einen Vergleich; `&noAA` bleibt als
Abwärtskompatibilität deaktiviert. Spätere Quality Presets sollen AA als optionale
Qualitätsstufe führen, statt es pauschal einzuschalten. `&noShadows` deaktiviert
die einmalig erzeugte 2048px-Shadowmap. Die sichtbaren FPS bleiben durch `requestAnimationFrame` auf die
Bildwiederholrate begrenzt. `GPU-Durchsatz` wird aus asynchronen GPU-Timings des
eigentlichen Renderaufrufs berechnet und bleibt deshalb oberhalb der
Bildwiederholrate vergleichbar; er ist nicht mit dargestellten FPS gleichzusetzen.

Die Debug-Leiste bietet dieselben Vergleiche ohne manuelle URL-Eingabe:

- `Vegetation` blendet ausschließlich die Grasgeometrie aus oder ein;
- `AA` lädt die Ansicht mit dem umgeschalteten WebGL-Kontext neu;
- `Schatten` schaltet Shadowmap-Erzeugung und -Abfragen direkt um;
- `DPR 0.5`, `1`, `1.5` und `2` setzen die Renderauflösung direkt. Der aktive Wert
  trägt ein Häkchen und bleibt beim AA-Neuladen in der Adresse erhalten.

Für einen Vergleich wird die Kamera zuerst mit `C` eingefroren. Danach immer nur
eine Einstellung ändern und die angezeigte GPU-Renderzeit vergleichen.

Das Chunk-Culling verwirft zunächst grobe gespeicherte Chunks. Anschließend prüft
die Dichteberechnung jeden maskenaktiven Render-Tile gegen denselben Frustum.
`Tile-Frustum` zeigt deshalb die verbleibenden Tiles vor der Distanz-LOD gegenüber
allen nach dem Chunk-Culling geprüften Tiles.

Steuerung:

- in die Ansicht klicken: Maussteuerung aktivieren;
- Maus: Blickrichtung ändern;
- `W`, `A`, `S`, `D`: horizontal bewegen;
- Leertaste: nach oben bewegen;
- Shift: nach unten bewegen;
- `C`: Culling und LOD einfrieren oder an der Beobachterposition fortsetzen;
- `G`: Cell- und Pattern-Debugfläche ein- oder ausblenden;
- `B`: Chunk-Bounding-Boxes ein- oder ausblenden;
- Escape: Maussteuerung freigeben.

Beim ersten Druck auf `C` wird eine Kopie der aktuellen Kamera für Culling und
LOD eingefroren. Die ursprüngliche Kamera bleibt als Beobachter beweglich.
Ein weiterer Druck auf `C` setzt Culling und LOD an der aktuellen
Beobachterposition fort. Die Renderer-Einstellungen bleiben unverändert.

Orange Linien zeigen die Bounding Boxes aller Chunks. Das eingefrorene
Kamera-Frustum wird in der Beobachteransicht als sehr transparente blaue Fläche
mit hellblauen Außenlinien dargestellt.

## Gemeinsame Debug-Steuerung für Integrationen

`WebGLVegetationDebug` wird aus `three-vegetation-pipeline` exportiert und sowohl
im Beispiel und in Consumer-Integrationen verwendet. Es verwendet den vorhandenen Adapter
und die vorhandene Grasansicht, ohne eine zweite Runtime oder einen Renderloop
zu erzeugen. Der Host deaktiviert währenddessen seine eigene Kamerasteuerung
und sein Pointer-Picking.

```ts
const debug = new WebGLVegetationDebug({ adapter, grass, camera, scene, panelParent });
debug.update(deltaSeconds);
const visibilityCamera = debug.cullingCamera;
// Bestehendes Frustum-Culling UND updateDensity verwenden visibilityCamera.
// Mit der ursprünglichen camera rendern; CPU-Zeit separat messen.
debug.recordFrame(deltaSeconds, vegetationCpuMilliseconds);
debug.beginGpuFrame();
renderer.render(scene, camera);
debug.endGpuFrame();
// Vor grass.dispose() und adapter.dispose():
debug.dispose();
```

Die lokale Cell-Fläche und die Boxen hängen am Grasobjekt. Das Frustum hängt
an der Welt-Szene außerhalb transformierter Modellgruppen. Das DOM-Panel zeigt
Zähler zweimal pro Sekunde; die Renderer-Einstellungen werden nur gelesen.
Die Cell-Fläche zeigt die ursprüngliche VEGFILE-Maske mit maximalen Ankern, keine
dynamische LOD-Darstellung. Die seedbasierte Cell-Coverage wirkt erst über die
pro Tile eingereichten Budgets.
`C` friert Position und Projektion für Culling und LOD ein. Beim Fortsetzen
wird die aktuelle Beobachterposition übernommen, ohne Kamerasprung.
Tastatursteuerung gilt nur bei gefangener Maus; Panel-Buttons funktionieren
auch ohne Pointer Lock. Escape gibt die Maus für andere Bedienelemente frei.
