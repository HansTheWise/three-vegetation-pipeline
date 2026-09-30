# VEGFILE build status

`NodeVegFileBuildStatusManager` loads the local GLB and optional VEGFILE bytes,
then passes both values and the compiler configuration to the core
`VegFileBuildStatusManager`.

```text
local GLB path -> GLB ArrayBuffer
local VEGFILE path -> Uint8Array | null
  -> core VegFileBuildStatusManager
  -> up-to-date | missing | outdated | invalid
```

This Node.js module owns path and filesystem behavior only. Fingerprint
calculation, VEGFILE validation, comparison, and status semantics remain in
the source-independent compiler core.
