import {
  createThreeVegetationSceneBinding,
  grassPreset,
  type WebGLVegetationLayerModule,
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
import {
  createWebGLGrassLayerModule,
  type WebGLVegetationLayerRenderer,
} from 'three-vegetation-pipeline/webgl';

const grass = grassPreset({
  layerId: 0,
  key: 'grass',
  density: { renderTileSizeCells: 16 },
});

const customModule = null as WebGLVegetationLayerModule | null;
const frame = null as VegetationFrameState | null;
const preparedGrass = null as GrassLayerPreparedData | null;
const layerRenderer = null as WebGLVegetationLayerRenderer | null;

document.querySelector('#app')!.textContent = [
  createThreeVegetationSceneBinding,
  grass.key,
  customModule,
  frame,
  preparedGrass,
  layerRenderer,
  grassProfilePreset,
  createWebGLGrassLayerModule,
  parseVegFile,
  WebGLGrassDebug,
].join(':');
