# Vegetation runtime orchestration

`WebGLVegetationRuntime` owns the runtime lifecycle after CPU preparation.

It creates shared VEGFILE resources once, performs shared stored-chunk frustum
culling once per frame and then updates each enabled profile renderer. Disabled
layers skip profile work. A layer disabled in the initial config has no prepared
or GPU data and therefore requires runtime recreation before it can be enabled.

Every used profile must be passed explicitly through `layerModules`. The
runtime contains no built-in Grass or other renderer registration.
