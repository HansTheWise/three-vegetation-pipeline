export type HeightValueBits = 8 | 16 | 32;

/** Quantization choice consumed by the fixed VEGFILE v1 writer. */
export type VegWriterConfig = Readonly<{
  heightValueBits: HeightValueBits;
}>;

export type VegFileMetadata = Readonly<{
  /** 128-bit fingerprint derived from the source model and compiler config. */
  buildFingerprint: Uint8Array;
}>;
