import type { PatchConfig } from './types.js';
import { validateGroundPatchConfig } from './validateGroundPatchConfig.js';

export function validatePatchConfig(config: PatchConfig): void {
  if (!config?.ground) throw new Error('Runtime patches must define a ground block.');
  if ('vegetation' in config) {
    throw new Error('patches.vegetation has been removed. Use density.activeCells for seeded Cell coverage.');
  }
  validateGroundPatchConfig(config.ground);
}
