# Stored vegetation chunk extraction

This module coordinates vegetation-mask rasterization and height-map extraction
for every logical chunk. It decides whether a chunk contains vegetation and
therefore belongs in the compact stored-chunk arrays.

Its input is already selected and spatially partitioned triangle data. Its
output contains the logical-to-stored lookup, unquantized height maps, height
ranges, and per-layer masks. It does not construct the final dataset and does
not encode VEGFILE bytes.
