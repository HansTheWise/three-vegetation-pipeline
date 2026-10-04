# Dataset preparation

This module creates the renderer-independent runtime data consumed by the root
`VegetationRuntimeManager`.

```text
VEGFILE bytes + VegetationRuntimeConfig + selected runtime profiles
  -> VegetationPipelineSetup.createVegetationDataset
     -> WorkerVegFileDatasetCreationAdapter
  -> VegFileDatasetCreationManager
     -> VEGFILE parsing and validation
     -> createPreparedVegetationDataset
        -> enabled layer selection
        -> profile-owned CPU preparation
  -> VegetationDatasetCreationResult
```

`VegetationPipelineSetup` obtains the adapter from the selected runtime
profiles; `VegetationRuntimeManager` never runs this CPU work implicitly on the
calling thread. `WorkerVegFileDatasetCreationAdapter` delegates the data flow to
`VegFileDatasetCreationManager` inside the profile package's Worker. Dataset
creation does not create WebGL resources or layer renderers. Those consume the
completed result in the next runtime stage.
