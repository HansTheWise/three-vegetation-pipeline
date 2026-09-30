/** Maximum positive instance count accepted by WebGL's signed GLsizei. */
export const MAXIMUM_WEBGL_INSTANCE_COUNT = 0x7fff_ffff;

export function validateWebGLInstanceCount(count: number, subject: string): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAXIMUM_WEBGL_INSTANCE_COUNT) {
    throw new Error(`${subject} exceeds the signed WebGL GLsizei range.`);
  }
}
