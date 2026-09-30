import { describe, expect, it } from 'vitest';
import { validateGlbArrayBuffer } from '../src/pre-runtime-compiler-core/glb-array-buffer-validation/validateGlbArrayBuffer.js';
import { createMinimalGlb } from './fixtures/createMinimalGlb.js';

describe('validateGlbArrayBuffer', () => {
  it('accepts a complete GLB v2 ArrayBuffer', () => {
    const glbArrayBuffer = createMinimalGlb();

    expect(() => validateGlbArrayBuffer(glbArrayBuffer)).not.toThrow();
  });

  it('rejects bytes without a complete GLB header', () => {
    expect(() => validateGlbArrayBuffer(new ArrayBuffer(8)))
      .toThrow('GLB ArrayBuffer is shorter than the 12-byte GLB header.');
  });

  it('rejects a GLB header whose declared length differs from the buffer', () => {
    const glbArrayBuffer = createMinimalGlb();
    new DataView(glbArrayBuffer).setUint32(8, glbArrayBuffer.byteLength + 4, true);

    expect(() => validateGlbArrayBuffer(glbArrayBuffer))
      .toThrow('but the ArrayBuffer contains');
  });
});
