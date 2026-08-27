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
der Campus-Chunks das Kamera-Frustum schneidet. Die Nahansicht richtet sich auf
den gespeicherten Chunk mit den meisten aktiven Cells und zeigt standardmäßig
die produktive Grasansicht.

Die Testansicht wird aus dem Repository-Stamm gestartet:

```sh
npm run debug:webgl
```

Danach kann `http://127.0.0.1:5173/examples/webgl-debug-chunks.html?near`
geöffnet werden. Falls Vite einen anderen Port meldet, muss dieser Port in der
Adresse verwendet werden.

Steuerung:

- in die Ansicht klicken: Maussteuerung aktivieren;
- Maus: Blickrichtung ändern;
- `W`, `A`, `S`, `D`: horizontal bewegen;
- Leertaste: nach oben bewegen;
- Shift: nach unten bewegen;
- `C`: zwischen Culling-Kamera und Beobachterkamera wechseln;
- `G`: Cell- und Pattern-Debugfläche ein- oder ausblenden;
- `B`: Chunk-Bounding-Boxes ein- oder ausblenden;
- Escape: Maussteuerung freigeben.

Beim ersten Druck auf `C` wird die Beobachterkamera an der aktuellen Position
erstellt. Die Culling-Kamera bleibt dort eingefroren und bestimmt weiterhin
die sichtbaren Chunks. Dadurch kann die Beobachterkamera vom blauen Frustum
wegbewegt werden, ohne das Culling-Ergebnis zu verändern. Ein weiterer Druck
auf `C` entfernt die Beobachterkamera und gibt die Culling-Kamera wieder frei.

Orange Linien zeigen die Bounding Boxes aller Chunks. Das eingefrorene
Kamera-Frustum wird in der Beobachteransicht als sehr transparente blaue Fläche
mit hellblauen Außenlinien dargestellt.
