# WebGL data-texture layout

This module contains the pure layout functions used by runtime and layer
profile textures. It converts a linear texel count into supported two-dimensional
texture dimensions and pads typed arrays only when the final row is incomplete.

It owns no WebGL resource and has no manager lifecycle.
