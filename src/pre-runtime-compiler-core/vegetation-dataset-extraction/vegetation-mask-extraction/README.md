# Vegetation mask extraction

This module rasterizes selected vegetation triangles into binary chunk masks,
removes cells covered by exclusion triangles, and detects forbidden overlap
between vegetation layers.

It operates on one chunk at a time and does not decide which logical chunks are
stored in the final dataset.
