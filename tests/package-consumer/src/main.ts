import {
  createThreeVegetationSceneBinding,
  createVegetationPipelineSetup,
  createWebGLGrassRuntimeProfile,
  grassPreset,
  type VegetationRuntimeProfile,
} from 'three-vegetation-pipeline';
import { WebGLGrassDebug } from 'three-vegetation-pipeline/debug';
import {
  grassPreset as grassProfilePreset,
  type GrassLayerPreparedData,
} from 'three-vegetation-pipeline/profiles/grass';
import {
  parseVegFile,
  type VegetationFrameState,
} from 'three-vegetation-pipeline/runtime';
import type { WebGLVegetationLayerRenderer } from 'three-vegetation-pipeline/webgl';

const grass = grassPreset({
  vegetationLayerId: 0,
  vegetationLayerKey: 'grass',
  density: { renderTileSizeCells: 16 },
});

const customProfile = null as VegetationRuntimeProfile | null;
const frame = null as VegetationFrameState | null;
const preparedGrass = null as GrassLayerPreparedData | null;
const layerRenderer = null as WebGLVegetationLayerRenderer | null;
const pipelineSetup = createVegetationPipelineSetup({
  runtimeProfiles: [createWebGLGrassRuntimeProfile()],
});

document.querySelector('#app')!.textContent = [
  createThreeVegetationSceneBinding,
  grass.vegetationLayerKey,
  customProfile,
  frame,
  preparedGrass,
  layerRenderer,
  grassProfilePreset,
  pipelineSetup,
  parseVegFile,
  WebGLGrassDebug,
].join(':');
