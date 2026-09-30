# Dataset preparation

This module creates the renderer-independent runtime data consumed by the root
`VegetationRuntimeManager`.

```text
VEGFILE bytes + VegetationRuntimeConfig + optional cancellation signal
  -> required VegFileDatasetCreationAdapter.createVegetationDataset
  -> VegFileDatasetCreationManager
     -> VEGFILE parsing and validation
     -> createPreparedVegetationDataset
        -> enabled layer selection
        -> profile-owned CPU preparation
  -> VegetationDatasetCreationResult
```

`VegetationRuntimeManager` requires the caller to provide the adapter through
`datasetCreationAdapter`; it never runs this CPU work implicitly on the calling
thread. `WorkerVegFileDatasetCreationAdapter` is the official integration and
delegates the data flow to `VegFileDatasetCreationManager` inside a Worker.
Projects that deliberately use another execution environment can implement the
same adapter contract. Dataset creation does not create WebGL resources or layer
renderers. Those consume the completed result in the next runtime stage.
