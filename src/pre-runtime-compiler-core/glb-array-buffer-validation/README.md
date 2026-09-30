# GLB ArrayBuffer validation

`validateGlbArrayBuffer` verifies that caller-provided bytes contain a complete
GLB v2 header and that its declared byte length matches the `ArrayBuffer`.

```text
GLB ArrayBuffer -> validateGlbArrayBuffer -> validated GLB ArrayBuffer
```

Loading files and resolving paths remain responsibilities of the integration
that calls the compiler core.
