import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseVegFile, createGrassGroundPatchField } from '../dist/index.js';

const assetPath = process.argv[2];
if (!assetPath) throw new Error('Usage: node tooling/benchmark-vegetation-patches.mjs <asset.veg>');
const file = parseVegFile(readFileSync(assetPath));
const layerId = file.layers[0].id;
const presets = [
  { name: 'previous', minimum: 8, maximum: 10, targetCoverage: 0.8, falloff: 3, distortion: 1 },
  { name: 'small-patch-stress', minimum: 2, maximum: 4, targetCoverage: 0.7, falloff: 1, distortion: 1 },
  { name: 'soft-meadow', minimum: 8, maximum: 20, targetCoverage: 0.7, falloff: 8, distortion: 0.35 },
];
for (const preset of presets) {
  const config = {
    enabled: true, seed: 0,
    radiusMeters: { minimum: preset.minimum, maximum: preset.maximum },
    targetCoverage: preset.targetCoverage, allowMerging: true,
    edgeFalloffMeters: preset.falloff, shapeDistortion: preset.distortion,
    colors: { baseColor: '#3aa935', brightnessVariation: 0.06 },
  };
  const milliseconds = [];
  let field;
  let sha256;
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    field = createGrassGroundPatchField(file, layerId, config);
    milliseconds.push(performance.now() - start);
    const hash = createHash('sha256').update(field.data).digest('hex');
    if (sha256 && sha256 !== hash) throw new Error('Non-deterministic patch field');
    sha256 = hash;
  }
  console.log(JSON.stringify({
    preset: preset.name, milliseconds,
    medianMilliseconds: [...milliseconds].sort((a, b) => a - b)[1],
    patchCount: field.patchCount, achievedCoverage: field.achievedCoverage,
    fieldBytes: field.data.byteLength, sha256,
  }));
}
