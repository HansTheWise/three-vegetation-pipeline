# Model triangle selection

This module maps configured model axes to extraction coordinates and selects
triangles for height surfaces, vegetation layers, and optional exclusion
surfaces. Vegetation triangles are filtered by maximum slope here.

Its output contains selected triangles only; spatial chunk partitioning belongs
to extraction-grid construction.
