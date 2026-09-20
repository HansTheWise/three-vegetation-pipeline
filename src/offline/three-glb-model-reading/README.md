# Three.js-GLB-Reader

`ThreeGlbReader` übersetzt ein statisches GLB-Modell in neutrale Dreiecksdaten.

```text
GLB ArrayBuffer -> ThreeGlbReader -> ModelData
```

## Ablauf

1. `GLTFLoader` liest die GLB-Bytes.
2. Der Reader durchläuft sichtbare Meshes.
3. Vertexpositionen werden in den lokalen Raum der GLB-Wurzel transformiert.
4. Materialgruppen werden als getrennte `ModelPrimitive`-Einträge ausgegeben.
5. Der Reader ermittelt Grenzen sowie die Anzahl übernommener Meshes und Dreiecke.

## Eingabegrenzen

- Unsichtbare Objekte werden standardmäßig ausgelassen und können über
  `includeInvisibleObjects` einbezogen werden.
- Instanced Meshes, Skinned Meshes und aktive Morph Targets werden abgelehnt,
  weil ihre zusätzlichen Transformationen oder Verformungen sonst verloren gingen.
- `ModelData` enthält keine Vegetationslayer, Chunks, Heightmaps oder VEGFILE-Daten.

## Schnittstellen

```ts
new ThreeGlbReader(options).readGlb(arrayBuffer): Promise<ModelData>
new ThreeGlbReader(options).readModelRoot(root): ModelData
```

`readModelRoot` verarbeitet auch eine bereits geladene Three.js-Objekthierarchie.
