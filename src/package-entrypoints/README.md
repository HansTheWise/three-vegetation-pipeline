# Package entrypoints

This directory contains only the files that assemble APIs across module boundaries.
It contains no pipeline logic.

- `PublicApi.ts` defines the stable default package API exported as
  `three-vegetation-pipeline`.
- `WebGLApi.ts` defines the optional `three-vegetation-pipeline/webgl` API.
- `DebugApi.ts` defines the optional `three-vegetation-pipeline/debug` API.
- `InternalDevelopmentApi.ts` exposes the complete internal API to repository tests,
  examples, and benchmarks. It is not an exported npm package entrypoint.

Module-local `index.ts` files remain next to their modules when they define that
module's own public boundary.
