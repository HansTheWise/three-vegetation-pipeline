export type HeightValueBits = 8 | 16 | 32;

/** Binary choices consumed by the .veg writer. */
export type VegWriterConfig = Readonly<{
  format: 'veg';
  fileVersion: 1;
  byteOrder: 'little-endian';
  heightValueBits: HeightValueBits;
}>;
