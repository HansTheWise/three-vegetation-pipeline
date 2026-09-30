const GLB_HEADER_BYTE_LENGTH = 12;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;

/** Validates the source-independent GLB container header. */
export function validateGlbArrayBuffer(glbArrayBuffer: ArrayBuffer): void {
  if (glbArrayBuffer.byteLength < GLB_HEADER_BYTE_LENGTH) {
    throw new Error('GLB ArrayBuffer is shorter than the 12-byte GLB header.');
  }

  const glbHeader = new DataView(glbArrayBuffer, 0, GLB_HEADER_BYTE_LENGTH);
  if (glbHeader.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('GLB ArrayBuffer has an invalid magic value.');
  }
  if (glbHeader.getUint32(4, true) !== GLB_VERSION) {
    throw new Error(`GLB ArrayBuffer must use GLB version ${GLB_VERSION}.`);
  }

  const declaredByteLength = glbHeader.getUint32(8, true);
  if (declaredByteLength !== glbArrayBuffer.byteLength) {
    throw new Error(
      `GLB header declares ${declaredByteLength} bytes but the ArrayBuffer contains ${glbArrayBuffer.byteLength}.`,
    );
  }
}
