# Chunk height-map extraction

This module samples selected height-surface triangles on the fixed grid of one
stored chunk. It fills missing samples deterministically and returns unquantized
heights plus the chunk's minimum and maximum height.

It does not select model surfaces, decide whether a chunk is stored, or encode
height values for VEGFILE.
