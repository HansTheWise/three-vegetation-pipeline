import type { ClipSpaceDepthRange, Matrix4Elements } from '../chunking/types.js';
import type { ModelPosition } from '../density/types.js';

/** Renderer-neutral camera data consumed by shared culling and layer rendering. */
export type VegetationFrameState = Readonly<{
  cameraPositionModel: ModelPosition;
  clipFromModelMatrix: Matrix4Elements;
  clipSpaceDepthRange: ClipSpaceDepthRange;
}>;
