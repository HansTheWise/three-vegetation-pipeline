# Node.js VEGFILE output

`writeVegFileAtomically` persists complete VEGFILE bytes. It writes a temporary
file in the target directory and then atomically replaces the requested output
path.

```text
VEGFILE Uint8Array + output path -> local .veg file
```

Binary VEGFILE encoding remains the responsibility of the compiler core's
`VegFileWriter`.
