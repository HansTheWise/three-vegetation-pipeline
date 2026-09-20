# Offline-Pipeline

Die Offline-Pipeline übersetzt ein GLB-Modell und eine Compiler-Config in eine
validierte VEGFILE-v2-Datei. Sie erzeugt keine Runtime- oder GPU-Ressourcen.

## Datenfluss

```text
GLB-Bytes + Compiler-Config
  → ThreeGlbReader
  → ModelData
  → VegetationExtractor
  → VegetationDataset
  → Vegetation Dataset Validation
  → VegWriter
  → VEGFILE-v2-Bytes
  → NodeVegCompiler
  → .veg-Datei
```

## Module

| Reihenfolge | Modul | Verantwortung |
|---:|---|---|
| 1 | [Offline Compilation Orchestration](./offline-compilation-orchestration/README.md) | Configvertrag, Ablaufsteuerung, Fingerprint, Dateisystem und CLI |
| 2 | [Three GLB Model Reading](./three-glb-model-reading/README.md) | Three.js-GLB in neutrale `ModelData`-Primitive übersetzen |
| 3 | [Vegetation Dataset Extraction](./vegetation-dataset-extraction/README.md) | Flächen auswählen, Chunk-Grid bilden, Heightmaps und Layermasken erzeugen |
| 4 | [Vegetation Dataset Validation](./vegetation-dataset-validation/README.md) | Vollständigkeit und interne Konsistenz vor dem Schreiben prüfen |
| 5 | [VEGFILE v2 Serialization](./vegfile-v2-serialization/README.md) | Dataset gemäß dem gemeinsamen v2-Schema binär kodieren |
| 6 | [VEGFILE v2 Format](../vegfile-v2-format/README.md) | Gemeinsame Source of Truth für Writer und Parser |

## Zentrale Datengrenzen

- `ModelData` ist unabhängig von Vegetationslayern und Dateiformaten.
- `VegetationDataset` enthält die extrahierten, noch nicht quantisierten Daten.
- `Uint8Array` enthält ausschließlich gültige VEGFILE-v2-Bytes.
- `NodeVegCompiler` besitzt die Dateisystemverantwortung; Reader, Extractor und
  Writer bleiben davon unabhängig.

## Einstieg

`compileGlbToVeg` verarbeitet bereits geladene Bytes. `createVegFile` ergänzt
das atomare Schreiben auf die Festplatte. Die CLI verwendet denselben Ablauf:

```text
npm run veg:compile -- --input <model.glb> --config <config.ts> --output <asset.veg>
```

## Zurückgestellte Entscheidungen

Eine zentrale Laufzeitvalidierung direkt geladener JavaScript-Compiler-Configs
ist bewusst noch nicht umgesetzt. TypeScript-Typen schützen derzeit den
regulären Configpfad.

VEGFILE v2 enthält außerdem weiterhin die vollständigen `sourceBounds`. Writer
und Parser validieren sie, die Runtime verwendet sie derzeit jedoch nicht. Ihre
Entfernung benötigt eine ausdrückliche Änderung des Binärlayouts und eine
Neuerzeugung bestehender Assets.
