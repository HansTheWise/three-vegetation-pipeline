# Extraction grid construction

This module derives the logical chunk grid from selected height-surface
triangles and partitions height, vegetation, and exclusion triangles into the
chunks they overlap.

Its output is `ChunkedExtractionTriangles`, which is consumed by stored-chunk
extraction. It does not rasterize masks or sample heights.
