import type { ClipSpaceDepthRange, Matrix4Elements } from '../stored-chunk-visibility/frustum-visibility-evaluation/StoredChunkVisibilityTypes.js';
import type { ModelPosition } from '../../layer-profiles/reusable-profile-features/render-tile-density-selection/DensitySelectionTypes.js';

/** Renderer-neutral camera data consumed by shared culling and layer rendering. */
export type VegetationFrameState = Readonly<{
  cameraPositionModel: ModelPosition;
  clipFromModelMatrix: Matrix4Elements;
  clipSpaceDepthRange: ClipSpaceDepthRange;
}>;
