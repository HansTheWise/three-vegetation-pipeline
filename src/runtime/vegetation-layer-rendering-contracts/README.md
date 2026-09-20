# Vegetation layer rendering contracts

This module defines the small boundary between the generic runtime and a WebGL
layer profile.

`WebGLVegetationLayerModule` combines profile-owned configuration validation,
CPU preparation, transfer-buffer collection, prepared-data validation and
renderer creation. One module owns one `profileType`.

`WebGLVegetationLayerRenderer` receives shared GPU resources and one prepared
layer. It owns profile-specific frame work, scene objects and cleanup.

`WebGLVegetationLightingMaterialFactory` lets a renderer request a lit shader
material without depending on a specific scene-light implementation.
