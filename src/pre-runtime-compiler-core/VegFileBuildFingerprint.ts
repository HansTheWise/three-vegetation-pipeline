import type {
  ModelSurfaceNameRule,
  ModelSurfaceSelection,
  ResolvedVegetationCompilerConfig,
} from './configuration/VegetationCompilerConfig.js';

const BUILD_FINGERPRINT_DOMAIN = new TextEncoder().encode('VEGFILE_BUILD_V2');

/** Identifies the exact source bytes and compiler config used for one build. */
export async function createVegFileBuildFingerprint(
  glbArrayBuffer: ArrayBuffer,
  vegetationCompilerConfig: ResolvedVegetationCompilerConfig,
): Promise<Uint8Array> {
  const sourceHash = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', glbArrayBuffer),
  );
  const configBytes = new TextEncoder().encode(canonicalJson(
    createVegFileV2FingerprintConfig(vegetationCompilerConfig),
  ));
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

/** Preserves the VEGFILE-v2 fingerprint contract across public TypeScript renames. */
function createVegFileV2FingerprintConfig(config: ResolvedVegetationCompilerConfig): unknown {
  return {
    coordinateSystem: config.extraction.coordinateSystem,
    source: {
      includeInvisibleObjects: config.glbModelReading.includeInvisibleObjects,
      heightSurfaceSelector: toVegFileV2SurfaceSelection(
        config.extraction.heightMap.sourceSurfaceSelection,
      ),
    },
    extraction: {
      seed: {
        mode: 'manual',
        manualValue: config.extraction.vegetationSeed,
      },
      grid: config.extraction.grid,
      heightMap: {
        resolution: config.extraction.heightMap.resolutionPerChunkAxis,
      },
      vegetationMask: {
        allowLayerOverlap: config.extraction.allowVegetationLayerOverlap,
      },
      vegetationLayers: config.extraction.vegetationLayers.map((layer) => ({
        id: layer.vegetationLayerId,
        key: layer.vegetationLayerKey,
        maskResolution: layer.maskResolutionPerChunkAxis,
        surfaceSelector: toVegFileV2SurfaceSelection(layer.includedSurfaceSelection),
        ...(layer.excludedSurfaceSelection
          ? {
            exclusionSurfaceSelector: toVegFileV2SurfaceSelection(
              layer.excludedSurfaceSelection,
            ),
          }
          : {}),
        filters: layer.filters,
      })),
    },
    output: config.vegFileEncoding,
  };
}

function toVegFileV2SurfaceSelection(selection: ModelSurfaceSelection): unknown {
  return 'matchAll' in selection
    ? { all: selection.matchAll.map(toVegFileV2SurfaceNameRule) }
    : { any: selection.matchAny.map(toVegFileV2SurfaceNameRule) };
}

function toVegFileV2SurfaceNameRule(rule: ModelSurfaceNameRule): unknown {
  switch (rule.property) {
    case 'hierarchyNodeName':
      return {
        type: 'hierarchy-node-name',
        values: rule.acceptedNames,
        caseSensitive: rule.caseSensitive,
      };
    case 'hierarchyNodeNamePrefix':
      return {
        type: 'hierarchy-node-name-prefix',
        values: rule.acceptedPrefixes,
        caseSensitive: rule.caseSensitive,
      };
    case 'materialName':
      return {
        type: 'material-name',
        values: rule.acceptedNames,
        caseSensitive: rule.caseSensitive,
      };
  }
}

export function formatVegFileBuildFingerprint(fingerprint: Uint8Array): string {
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
