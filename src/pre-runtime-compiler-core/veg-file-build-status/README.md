# VEGFILE build status

`VegFileBuildStatusManager` evaluates already loaded inputs without filesystem
access or vegetation extraction.

```text
GLB ArrayBuffer + VegetationCompilerConfig + existing VEGFILE bytes or null
  -> validate config and GLB
  -> calculate expected build fingerprint
  -> validate existing VEGFILE when present
  -> compare fingerprints
  -> up-to-date | missing | outdated | invalid
```

The integration layer owns loading optional files. This core module owns all
format validation, fingerprint calculation, comparison, and status semantics.
