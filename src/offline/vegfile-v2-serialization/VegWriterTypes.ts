import type { HeightValueBits } from '../../vegfile-v2-format/VegetationFileTypes.js';

export type { HeightValueBits } from '../../vegfile-v2-format/VegetationFileTypes.js';

/** User-selected height precision consumed by the VEGFILE v2 writer. */
export type VegWriterConfig = Readonly<{
  heightValueBits: HeightValueBits;
}>;

export type VegFileMetadata = Readonly<{
  /** 128-bit fingerprint derived from the source model and compiler config. */
  buildFingerprint: Uint8Array;
}>;
