import { readFile } from 'node:fs/promises';
import { resolveSourceGlbFilePath } from '../file-path-validation/PreRuntimeFilePaths.js';

/** Reads a local GLB file into an ArrayBuffer. */
export class NodeGlbFileSource {
  readonly sourceGlbFilePath: string;

  constructor(sourceGlbFilePath: string) {
    this.sourceGlbFilePath = resolveSourceGlbFilePath(sourceGlbFilePath);
  }

  async readGlbArrayBuffer(): Promise<ArrayBuffer> {
    const glbFileBytes = await readFile(this.sourceGlbFilePath);
    return glbFileBytes.buffer.slice(
      glbFileBytes.byteOffset,
      glbFileBytes.byteOffset + glbFileBytes.byteLength,
    ) as ArrayBuffer;
  }
}
