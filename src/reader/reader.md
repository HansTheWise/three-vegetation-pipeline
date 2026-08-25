# Reader

Der Reader übersetzt ein Three.js-kompatibles GLB-Modell in neutrale Modelldaten.

```text
GLB ArrayBuffer -> ThreeGlbReader -> ModelData
```

## Aufgabe

- GLB mit dem Three.js `GLTFLoader` einlesen.
- Sichtbare, statische Meshes und ihre Dreiecke sammeln.
- Transformationen innerhalb der GLB-Hierarchie in das lokale Koordinatensystem der GLB-Wurzel übernehmen.
- Positionen, Indizes, Mesh-Hierarchie, Materialnamen und Modellgrenzen bereitstellen.
- Nicht unterstützte Geometrie wie Skinned Meshes oder aktive Morph Targets ablehnen.

`ModelData` enthält noch keine Chunks, Heightmaps oder Vegetationsmasken. Der Reader kennt weder Vegetationslayer noch das `.veg`-Dateiformat.

## Schnittstellen

```ts
new ThreeGlbReader(options).read(arrayBuffer): Promise<ModelData>
new ThreeGlbReader(options).readObject(root): ModelData
```

`readObject` erlaubt Tests und die Verarbeitung einer bereits geladenen Three.js-Szene über denselben Konvertierungspfad.
