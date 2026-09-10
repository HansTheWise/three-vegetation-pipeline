import type { GrassPatchConfig } from './types.js';
import { validateGrassGroundPatchConfig } from './validateGrassGroundPatchConfig.js';

export function validateGrassPatchConfig(config: GrassPatchConfig): void {
  if (!config?.ground) throw new Error('Grass patches must define a ground block.');
  if ('vegetation' in config) {
    throw new Error('patches.vegetation has been removed. Use density.activeCells for seeded Cell coverage.');
  }
  validateGrassGroundPatchConfig(config.ground);
}
