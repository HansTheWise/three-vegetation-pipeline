# Grass ground-patch material integration

`WebGLGrassGroundPatchSurface` is the optional boundary through which the Grass
renderer exposes its prepared patch field and uploaded texture to a consumer
surface implementation.

`ThreeGrassGroundPatchSurface` traverses a configured object root once, selects
materials through `matchesMaterial`, and extends selected Lambert or Standard
materials through `onBeforeCompile`. Disposal restores the previous material
hooks and program cache keys.

This module does not generate the patch field or own its texture. Those remain
with Grass preparation and Grass layer resources.
