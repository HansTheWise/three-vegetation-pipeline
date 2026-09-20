# Layer profile preparation

This module dispatches enabled layers to their explicitly registered profile
preparation.

A `VegetationLayerPreparation` validates its config, builds profile-owned CPU
data, reports transferable buffers and returns conservative culling bounds.
The generic dataset builder supplies the matched VEGFILE layer and the shared
stored-chunk coordinate table, so profiles do not repeat those lookups.

The registry starts empty. Duplicate or missing profile registrations fail with
a descriptive error.
