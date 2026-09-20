# Grass runtime configuration

This module owns all Grass-specific runtime types, defaults and validation.
Keeping these values outside the generic runtime lets other layer profiles use
their own configuration shape.

`grassPreset(...)` creates a complete `GrassRuntimeLayerConfig` and applies only
the supplied nested overrides. `validateGrassRuntimeLayerConfig(...)` validates
distribution budgets, distance curves, blade geometry, lighting, colors,
patches and shadows before preparation starts.

Important groups:

- `distribution`: maximum Anchors and Elements per active Cell
- `density`: render-tile size and distance-based Cell/Anchor/Element ratios
- `visibility`: maximum render distance
- `pattern`: deterministic Anchor layout options
- `renderProfile`: Grass blade shape, colors and optional Clover rendering
- `lighting`, `shadows`, `patches`: Grass renderer features
