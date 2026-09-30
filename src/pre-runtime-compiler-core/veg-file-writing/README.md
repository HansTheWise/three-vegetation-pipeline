# VEGFILE writing

`writeVegFile` encodes a neutral `VegetationDataset` as VEGFILE v2.

```text
VegetationDataset + VegFileEncodingConfig + build fingerprint
                              -> Uint8Array
```

The writer validates its inputs, calculates the binary layout, quantizes chunk
heights to the configured `8`, `16`, or `32` bits, packs vegetation masks, and
writes the header, sections, and CRC32 checksum.

The writer knows no file paths and uses no Node.js APIs. Filesystem output is
owned by the separate
`three-vegetation-pipeline/node-pre-runtime-compiler-integration` entry point.

The byte-level contract is documented in
[`../../shared/vegfile-format/README.md`](../../shared/vegfile-format/README.md).
