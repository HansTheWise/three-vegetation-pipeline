# Runtime-Pipeline

Die Runtime-Pipeline lädt ein VEGFILE, verbindet es mit der Runtime-Config,
bestimmt sichtbare Chunks und stellt die benötigten Daten einem austauschbaren
GPU-Backend bereit. Parser, Dataset, IDs und Chunk-Culling bleiben
rendererunabhängig.

## Datenfluss

```mermaid
flowchart LR
  Veg[".veg-Bytes"]
  Config["VegetationRuntimeConfig"]
  Camera["Kamera + Modellmatrix"]

  subgraph InitCPU["Einmalig auf der CPU"]
    Parser["parseVegFile"]
    Parsed["ParsedVegFile<br/>validierte Typed-Array-Views"]
    DatasetBuilder["createVegetationRuntimeDataset"]
    Patterns["progressive Anchor-Patterns"]
    Patches["globales RG8-Patch-Feld"]
    Dataset["VegetationRuntimeDataset"]
    Boxes["Chunk-Begrenzungsboxen"]
  end

  subgraph InitGPU["Einmalig im WebGL-Adapter"]
    Static["statische GPU-Ressourcen<br/>Grid, Höhen, Masken, Patterns"]
    VisibleBuffer["Visible-Chunk-Buffer"]
  end

  subgraph FrameCPU["Pro Frame auf der CPU"]
    Matrix["projection × view × model"]
    Frustum["FrustumChunkVisibility"]
    Visible["visibleChunkIndices<br/>+ visibleChunkCount"]
  end

  subgraph RenderGPU["Pro Frame auf der GPU"]
    Debug["optionaler Debug-Renderer"]
    CellHash["Cell-Hash<br/>Pattern, Rotation, Spiegelung"]
    AnchorHash["Anchor-Hash"]
    ElementHash["optionaler Element-Hash"]
    Production["statischer WebGL-Grasrenderer"]
  end

  Veg --> Parser --> Parsed
  Parsed --> DatasetBuilder
  Config --> DatasetBuilder
  DatasetBuilder --> Patterns --> Dataset
  DatasetBuilder --> Patches --> Dataset
  DatasetBuilder --> Dataset
  Dataset --> Boxes
  Dataset --> Static
  Dataset --> VisibleBuffer

  Camera --> Matrix --> Frustum
  Boxes --> Frustum --> Visible --> VisibleBuffer

  Static --> Debug
  VisibleBuffer --> Debug
  Static --> CellHash
  VisibleBuffer --> CellHash
  CellHash --> Debug

  Static --> Production
  VisibleBuffer --> Production
  CellHash --> Production
  CellHash --> AnchorHash
  AnchorHash --> ElementHash
  ElementHash --> Production
```

## Initialisierung

### 1. Laden und Parsen

Das Laden einer URL bleibt Aufgabe der Anwendung. `parseVegFile` erhält einen
`ArrayBuffer` oder ein `Uint8Array`, validiert VEGFILE v1 vollständig und gibt
ein `ParsedVegFile` zurück. Masken und Heightmaps bleiben gepackt beziehungsweise
quantisiert. Bei geeigneter Ausrichtung zeigen die Typed Arrays direkt auf die
ursprünglichen Dateibytes.

### 2. Runtime-Dataset

`createVegetationRuntimeDataset` verbindet Parserdaten und Runtime-Config über
stabile Layer-IDs. Dabei werden:

- Configwerte einmalig validiert;
- fehlende oder doppelte Layerzuordnungen abgelehnt;
- Cell-Größen in Modell- und Metereinheiten berechnet;
- progressive Anchor-Patterns aus VEGFILE-Seed und Layerconfig erzeugt;
- aktivierte Patch-Felder einmalig erzeugt;
- aktivierte Layer als eigene Ansicht bereitgestellt;
- die größten aktiven `VegetationRenderBounds` für das gemeinsame grobe
  Chunk-Culling kombiniert.

Gemeinsame Layerwerte enthalten Pattern, Verteilung, Density/LOD,
Sichtbarkeit, Lighting und Shadows. Geometrie- und Shaderwerte liegen hinter
dem diskriminierten `renderProfile`. Das eingebaute Grass-Profil wird dadurch
nicht zum Pflichtschema für spätere Baum- oder Buschmodule.

Das Dataset kopiert die großen VEGFILE-Datenbereiche nicht.

`createVegetationActiveCellData(dataset, layerId)` bereitet die statische
VEG-Zulassung separat vor und mischt die Cell-Reihenfolge seedbasiert. Dataset und Cell-Arrays können in einem Worker
entstehen und anschließend transferiert werden. `WebGLGrassView` akzeptiert die
vorbereiteten Arrays; die kamerabhängigen Distanzbudgets bleiben unverändert.

### 3. Chunk-Begrenzungsboxen

`createRuntimeChunkBoundingBoxes` erzeugt für jeden gespeicherten Chunk sechs
Werte und berücksichtigt dabei die kombinierten Profil-Bounds:

```text
minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ
```

Diese Boxen liegen im lokalen Modellkoordinatensystem und werden nur einmal
berechnet. Sie sind Zahlendaten und keine unsichtbaren Three.js-Meshes.

### 4. Statische WebGL-Ressourcen

`WebGLStaticVegetationResources` lädt einmalig:

- Gridkoordinaten pro gespeichertem Chunk;
- minimale und maximale Chunkhöhe;
- quantisierte Heightmaps;
- bitgepackte Layer-Masken;
- normalisierte Pattern-Anker;
- aktivierte globale RG-Patch-Felder mit linearer Filterung und Mipmaps.

`WebGLVisibleChunkBuffer` reserviert zusätzlich einmalig Platz für maximal alle
gespeicherten Chunkindizes.

## Verarbeitung pro Frame

### 1. Frustum-Culling

Die Anwendung liefert `projection × view × model` und den Clip-Space-Tiefenraum.
`FrustumChunkVisibility` prüft jede Chunk-Box gegen die sechs Frustumebenen und
überschreibt nur den verwendeten Präfix seines bestehenden Ergebnisarrays:

```text
visibleChunkIndices[0 .. visibleChunkCount)
```

Die groben Chunk-Boxen bleiben der erste günstige Filter. Die anschließende
Tile-Dichteberechnung prüft jede maskenaktive Render-Tile-Box mit denselben
Frustumebenen und den Bounds des jeweiligen Layers, bevor sie Distanzbudgets
berechnet oder einen GPU-Record schreibt.

### 2. Upload der sichtbaren Chunks

`WebGLVegetationAdapter.updateVisibleChunks` kopiert den gültigen Präfix in den
bereits reservierten Visible-Chunk-Buffer. Es wird kein neues Array pro Frame
angelegt. Der Renderer zeichnet anschließend ausschließlich Einträge dieses
Buffers.

### 3. Optionale Debugdarstellung

`WebGLDebugChunkView` zeichnet momentan eine Heightmap-Fläche pro sichtbarem
Chunk. Der Fragment-Shader zeigt aktive Cells und ihre Pattern-Anker. Diese
Darstellung diagnostiziert dieselben Runtime- und GPU-Ressourcen, ist aber vom
produktiven Vegetationsrenderer getrennt.

### 4. Statischer WebGL-Grasrenderer

`WebGLGrassView` verwendet eine einmalig vorberechnete, seedbasiert gemischte
Liste maskenaktiver Cells. Nach dem Chunk-Culling verwirft ein zweiter
Frustumtest nicht sichtbare Render-Tiles. Drei kontinuierliche Distanzkurven
bestimmen für die verbleibenden Tiles die Cell-, Anchor- und Elementbudgets.
Tiles werden in die kleinste ausreichende GPU-Kapazitätsklasse gruppiert;
Nullbudgets starten keinen Draw. Der Vertex-Shader rekonstruiert Pattern und
Hashhierarchie, liest die Heightmap und positioniert die feste Halmgeometrie.
Halmform, Versatz und Farben werden vollständig aus Config und stabilen
Hashwerten abgeleitet.

## Koordinaten und Indizes

| Wert | Bedeutung | Speicherung |
| --- | --- | --- |
| `storedChunkIndex` | Adresse eines belegten Chunks in gepackten Arrays und Texturen | VEGFILE und Visible-Chunk-Buffer |
| `chunkGridX/Y` | Stabile Position des Chunks im logischen Grid | Einmal pro gespeichertem Chunk auf der GPU |
| `localCellX/Y` | Cell innerhalb eines Chunks, beispielsweise 0 bis 127 | Aus Maskenindex oder Shaderarbeit abgeleitet |
| `globalCellX/Y` | Cell im gesamten Layergrid | Nicht gespeichert; aus Grid- und lokalen Koordinaten berechnet |
| Modellkoordinaten | Tatsächliche Position relativ zur Modellwurzel | Aus Gridursprung, Chunkgröße, Cellposition und Heightmap rekonstruiert |

Die globale Cell-Koordinate entsteht nur für die stabile Identität:

```text
globalCellX = chunkGridX * maskResolution + localCellX
globalCellY = chunkGridY * maskResolution + localCellY
```

Der `storedChunkIndex` darf nicht Teil einer Vegetations-ID sein, weil er von den
tatsächlich gespeicherten Chunks und ihrer Speicherreihenfolge abhängt.

## Deterministische Hierarchie

```text
VEGFILE-Seed + Layer-ID + globale Cell
                    ↓
                 Cell-Hash
        Pattern, Rotation, Spiegelung
                    ↓ + anchorIndex
                Anchor-Hash
                    ↓ + optionaler elementIndex
                Element-Hash
```

Ein Baum oder Busch kann vollständig aus dem Anchor-Hash randomisiert werden.
Mehrere Elemente pro Anchor sind nur für Vegetationstypen erforderlich, die
mehrere unabhängig variierte Unterobjekte besitzen.

Die CPU- und GLSL-Funktionen verwenden dieselben Salts und Bitlayouts. Details
stehen in `identity/identity.md`.

## Aktuelle Renderstrecke

```text
sichtbare Chunks
→ aktive Render-Tiles
→ einmalig patch-gefilterte Cells
→ kontinuierliche Cell-/Anchor-/Elementbudgets
→ GPU-Kapazitätsbucket
→ kompakte aktive Cells
→ Pattern-Anker
→ Heightmap-Position
→ Gras-Elemente
→ Szenenlicht und eingehende Schatten
```
