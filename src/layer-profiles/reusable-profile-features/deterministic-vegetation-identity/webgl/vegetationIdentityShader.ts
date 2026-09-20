import {
  CELL_PATTERN_BITS,
  CELL_REFLECTION_BITS,
  CELL_ROTATION_BITS,
} from '../CellHashLayout.js';
import {
  ANCHOR_ORIENTATION_BITS,
  ANCHOR_REFLECTION_BITS,
  ANCHOR_SPECIES_BITS,
} from '../AnchorHashLayout.js';
import { VEGETATION_HASH_SALTS } from '../VegetationIds.js';
import { ELEMENT_DETAIL_HASH_SALT } from '../ElementHashLayout.js';

/** GLSL counterpart of the renderer-independent 32-bit vegetation ID contract. */
export const vegetationIdentityShader = /* glsl */ `
  uint mixVegetationHash(uint value) {
    value = (value ^ (value >> 16u)) * 0x7feb352du;
    value = (value ^ (value >> 15u)) * 0x846ca68bu;
    return value ^ (value >> 16u);
  }

  uint vegetationCellHash(uint seedValue, uint layer, uvec2 globalCell) {
    uint combined = seedValue
      ^ ((layer + 1u) * ${toGlslUint(VEGETATION_HASH_SALTS.layer)})
      ^ ((globalCell.x + 1u) * ${toGlslUint(VEGETATION_HASH_SALTS.cellX)})
      ^ ((globalCell.y + 1u) * ${toGlslUint(VEGETATION_HASH_SALTS.cellY)});
    return mixVegetationHash(combined);
  }

  uint vegetationAnchorHash(uint cellHashValue, uint anchorIndex) {
    return mixVegetationHash(
      cellHashValue ^ ((anchorIndex + 1u) * ${toGlslUint(VEGETATION_HASH_SALTS.anchor)})
    );
  }

  uint vegetationElementHash(uint anchorHashValue, uint elementIndex) {
    return mixVegetationHash(
      anchorHashValue ^ ((elementIndex + 1u) * ${toGlslUint(VEGETATION_HASH_SALTS.element)})
    );
  }

  uint vegetationElementDetailHash(uint elementHashValue) {
    return mixVegetationHash(
      elementHashValue ^ ${toGlslUint(ELEMENT_DETAIL_HASH_SALT)}
    );
  }

  uint anchorSpeciesValue(uint anchorHashValue) {
    return (anchorHashValue >> ${ANCHOR_SPECIES_BITS.offset}u)
      & ${toGlslUint((2 ** ANCHOR_SPECIES_BITS.length) - 1)};
  }

  uint anchorOrientationValue(uint anchorHashValue) {
    return (anchorHashValue >> ${ANCHOR_ORIENTATION_BITS.offset}u)
      & ${toGlslUint((2 ** ANCHOR_ORIENTATION_BITS.length) - 1)};
  }

  bool anchorIsReflected(uint anchorHashValue) {
    return ((anchorHashValue >> ${ANCHOR_REFLECTION_BITS.offset}u)
      & ${toGlslUint((2 ** ANCHOR_REFLECTION_BITS.length) - 1)}) == 1u;
  }

  uint cellPatternValue(uint cellHashValue) {
    return (cellHashValue >> ${CELL_PATTERN_BITS.offset}u)
      & ${toGlslUint((2 ** CELL_PATTERN_BITS.length) - 1)};
  }

  uint cellRotationQuarterTurns(uint cellHashValue) {
    return (cellHashValue >> ${CELL_ROTATION_BITS.offset}u)
      & ${toGlslUint((2 ** CELL_ROTATION_BITS.length) - 1)};
  }

  bool cellIsReflected(uint cellHashValue) {
    return ((cellHashValue >> ${CELL_REFLECTION_BITS.offset}u)
      & ${toGlslUint((2 ** CELL_REFLECTION_BITS.length) - 1)}) == 1u;
  }
`;

function toGlslUint(value: number): string {
  return `0x${(value >>> 0).toString(16)}u`;
}
