export const ELEMENT_HEIGHT_BITS = { offset: 0, length: 8 } as const;
export const ELEMENT_WIDTH_BITS = { offset: 8, length: 8 } as const;
export const ELEMENT_ORIENTATION_BITS = { offset: 16, length: 8 } as const;
export const ELEMENT_TILT_BITS = { offset: 24, length: 8 } as const;

/** A second deterministic value provides independent placement and color bytes. */
export const ELEMENT_DETAIL_HASH_SALT = 0xa511e9b3;
export const ELEMENT_OFFSET_ANGLE_BITS = { offset: 0, length: 8 } as const;
export const ELEMENT_OFFSET_RADIUS_BITS = { offset: 8, length: 8 } as const;
export const ELEMENT_BOTTOM_COLOR_BITS = { offset: 16, length: 8 } as const;
export const ELEMENT_TOP_COLOR_BITS = { offset: 24, length: 8 } as const;

export const MAX_ELEMENT_COLOR_COUNT = 2 ** ELEMENT_TOP_COLOR_BITS.length;
