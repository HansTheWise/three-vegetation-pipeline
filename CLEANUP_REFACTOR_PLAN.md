# Cleanup and refactor plan

Status: first systematic pass completed on 18 September 2026

## Goal

Review the complete vegetation data path from model input to WebGL rendering.
Remove redundant state, unjustified abstraction, hard-coded policy and outdated
documentation while preserving verified behavior.

## Working method

1. Read each module, its callers, tests and documentation.
2. Explain unclear behavior and agree on the complete change set.
3. Implement only after explicit approval.
4. Verify focused tests, full tests, typechecking, builds and relevant
   benchmarks.

## Completed review

1. **Offline compilation:** model reading, extraction, validation, v2 writing,
   provenance and atomic file output have separate responsibilities.
2. **VEGFILE v2:** writer and parser use the same schema and calculated layout;
   only version 2 is accepted.
3. **Runtime preparation:** only configured and enabled layers are prepared;
   profile modules own their validation and prepared data.
4. **Spatial data:** stored-Chunk coordinates and shared culling bounds are
   calculated once and reused.
5. **Runtime orchestration:** shared visibility is evaluated once per frame and
   unchanged visible-Chunk data is not uploaded again.
6. **Profile ownership:** Grass configuration, preparation, density, patterns,
   patches, GPU resources and rendering are outside the generic runtime.
7. **Grass rendering:** responsibilities and names are explicit, stable frames
   skip unchanged tile work, and benchmarks cover submission strategies.
8. **Debug paths:** generic diagnostics and Grass-specific diagnostics are
   separated and exported only through the optional `/debug` entry point.
9. **Package boundaries:** Grass remains opt-in, public entry points have clear
   ownership, and the linked consumer builds against the current exports.
10. **Documentation:** pipeline overviews and module READMEs describe the
    current directory structure and data flow.

## Deferred work

These items are not required to close the first pass:

- Validate dynamically loaded offline JavaScript config values before model
  processing. TypeScript currently protects the normal config path.
- Decide whether to remove `sourceBounds` from VEGFILE v2. The field is written,
  parsed and validated but currently has no runtime consumer; changing it
  requires an explicit format-layout decision and asset regeneration.
- Continue WebGL optimization only when profiling identifies a concrete
  bottleneck. The current power-of-two submission buckets remain the measured
  baseline.
- Evaluate WebGPU only after the WebGL path requires capabilities that justify
  maintaining a parallel backend.
- Keep visual acceptance in the consumer application; library verification
  remains based on tests, typechecking, builds and runtime diagnostics.
