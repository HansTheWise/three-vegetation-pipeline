export const CELL_PATTERN_BITS = { offset: 0, length: 8 } as const;
export const CELL_ROTATION_BITS = { offset: 8, length: 2 } as const;
export const CELL_REFLECTION_BITS = { offset: 10, length: 1 } as const;
export const CELL_UNASSIGNED_BITS = { offset: 11, length: 21 } as const;

export const MAX_CELL_PATTERN_COUNT = 2 ** CELL_PATTERN_BITS.length;
