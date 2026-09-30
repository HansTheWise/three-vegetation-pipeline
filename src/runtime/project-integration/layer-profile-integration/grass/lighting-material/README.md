# Grass lighting material integration

`WebGLGrassLightingMaterialFactory` is the project-facing contract used by the
Grass renderer to create one `ShaderMaterial` per candidate-capacity draw. It
receives Grass vertex and fragment shader sources, defines, uniforms and the
requested material side.

`ThreeWebGLGrassLightingMaterialFactory` is the default implementation. It
replaces the Grass lighting markers with Three.js light, shadow, tone-mapping
and color-space shader chunks. A consumer may supply another implementation
through `grassLightingMaterialFactory` without changing Grass placement, LOD or
density selection.

The marker contract is Grass-specific. It is not a general runtime lighting
adapter and does not query scene lights itself; Three.js supplies light and
shadow uniforms when it renders the resulting material.
