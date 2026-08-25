import type { VegCompilerConfig } from './VegCompiler.js';

const BUILD_FINGERPRINT_DOMAIN = new TextEncoder().encode('VEGFILE_BUILD_V1');

/** Identifies the exact source bytes and compiler config used for one build. */
export async function createBuildFingerprint(
  source: ArrayBuffer,
  config: VegCompilerConfig,
): Promise<Uint8Array> {
  const sourceHash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', source));
  const configBytes = new TextEncoder().encode(canonicalJson(config));
  const configHash = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', configBytes),
  );
  const fingerprintInput = new Uint8Array(
    BUILD_FINGERPRINT_DOMAIN.length + sourceHash.length + configHash.length,
  );
  fingerprintInput.set(BUILD_FINGERPRINT_DOMAIN);
  fingerprintInput.set(sourceHash, BUILD_FINGERPRINT_DOMAIN.length);
  fingerprintInput.set(configHash, BUILD_FINGERPRINT_DOMAIN.length + sourceHash.length);

  const fingerprintHash = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', fingerprintInput),
  );
  return fingerprintHash.slice(0, 16);
}

export function formatBuildFingerprint(fingerprint: Uint8Array): string {
  return [...fingerprint]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Compiler config contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const properties = Object.entries(value)
      .filter(([, propertyValue]) => propertyValue !== undefined)
      .sort(([first], [second]) => (
        first < second ? -1 : first > second ? 1 : 0
      ));
    return `{${properties.map(([key, propertyValue]) => (
      `${JSON.stringify(key)}:${canonicalJson(propertyValue)}`
    )).join(',')}}`;
  }
  throw new Error('Compiler config must contain only JSON-compatible values.');
}
