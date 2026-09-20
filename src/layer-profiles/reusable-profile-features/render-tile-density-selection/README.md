# Render-tile density selection

This optional profile feature groups mask Cells into configurable Render Tiles
and calculates distance-dependent Cell, Anchor and Element budgets. Grass uses
it, but the feature is independent of Grass and may be used by other renderer
profiles.

```text
visible stored chunks + layer mask + camera
  -> visible Render Tiles
  -> density budgets and capacity buckets
  -> Render Tile records + active Cell indices
```

Each Render Tile record contains four `uint32` values: stored-chunk index,
active-Cell-list offset, packed Cell/Anchor counts and active Element count.
The WebGL helpers upload these records as `RGBA32UI` and Cell indices as
`R32UI`. They reserve capacity once and skip uploads when the used data prefix
has not changed.

The Render Tile size and density curves come from the owning profile config.
This module does not define a renderer or register itself with the generic
runtime.
