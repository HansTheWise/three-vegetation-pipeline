# Grass project integration

Grass has two optional boundaries to consumer-owned rendering state:

- [Lighting material](./lighting-material/README.md) creates the Grass
  `ShaderMaterial` through an injectable lighting implementation.
- [Ground-patch material](./ground-patch-material/README.md) projects the
  prepared Grass patch field onto selected consumer materials.

Grass preparation, geometry, shaders and render resources remain under
`layer-profiles/grass`.
