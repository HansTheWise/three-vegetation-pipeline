# Layer-profile project integration

This module contains consumer-project boundaries that exist only for a specific
vegetation render profile. It does not own profile preparation, geometry,
rendering algorithms or GPU resources.

## Profiles

- [Grass](./grass/README.md) integrates Grass lighting materials and optional
  consumer-owned ground materials.
