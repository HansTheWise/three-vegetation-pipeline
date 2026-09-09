import {
  ACESFilmicToneMapping,
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  PCFShadowMap,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  createChunkBoundingBoxes,
  createVegetationRuntimeDataset,
  FrustumChunkVisibility,
  WebGLVegetationDebug,
  WebGLGrassView,
  WebGLVegetationAdapter,
  type ParsedVegFile,
} from '../src/index.js';
import { vegetationExampleConfig } from './vegetationExampleConfig.js';

const status = document.querySelector<HTMLDivElement>('#status');
if (!status) throw new Error('Debug status element is missing.');

const debugParameters = new URLSearchParams(window.location.search);
const antialiasEnabled = debugParameters.has('aa') && !debugParameters.has('noAA');
const renderer = new WebGLRenderer({ antialias: antialiasEnabled });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const requestedResolution = debugParameters.get('resolution');
let targetWidth = requestedResolution === '2k' ? 2560 : requestedResolution === '4k' ? 3840 : null;
const requestedPixelRatio = Number(debugParameters.get('dpr'));
let pixelRatio = (
  targetWidth
    ? targetWidth / window.innerWidth
    : Number.isFinite(requestedPixelRatio) && requestedPixelRatio > 0
    ? requestedPixelRatio
    : window.devicePixelRatio
);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !debugParameters.has('noShadows');
renderer.shadowMap.type = PCFShadowMap;
document.body.append(renderer.domElement);

const parsedVegFile = createExampleVegetationFile();
const runtimeDataset = createVegetationRuntimeDataset(
  parsedVegFile,
  vegetationExampleConfig,
);
const gpuAdapter = new WebGLVegetationAdapter(
  renderer,
  runtimeDataset,
);
const chunkBoundingBoxes = createChunkBoundingBoxes(parsedVegFile);
const chunkVisibility = new FrustumChunkVisibility(
  chunkBoundingBoxes,
);
const grass = new WebGLGrassView(gpuAdapter, 0);

const scene = new Scene();
scene.background = new Color('#9bc4dc');
scene.add(grass.mesh);
const ground = new Mesh(
  new PlaneGeometry(32, 32),
  new MeshLambertMaterial({ color: '#527d3d', side: DoubleSide }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const ambientLight = new AmbientLight('#b9c9df', 0.45);
scene.add(ambientLight);
scene.add(new AxesHelper(parsedVegFile.header.grid.chunkSize));

const { sourceBounds } = parsedVegFile.header;
const minimum = new Vector3(sourceBounds.minX, sourceBounds.minY, sourceBounds.minZ);
const maximum = new Vector3(sourceBounds.maxX, sourceBounds.maxY, sourceBounds.maxZ);
const center = minimum.clone().add(maximum).multiplyScalar(0.5);
const sceneRadius = Math.max(minimum.distanceTo(maximum) * 0.5, 1);
const useNearTestView = new URLSearchParams(window.location.search).has('near');
const nearChunkIndex = findDensestStoredChunk(
  runtimeDataset.enabledLayers[0]!.fileLayer.maskData,
  runtimeDataset.enabledLayers[0]!.fileLayer.maskWordsPerChunk,
  parsedVegFile.header.storedChunkCount,
);
const nearChunkOffset = nearChunkIndex * 6;
const nearChunkCenter = new Vector3(
  (
    chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset]!
    + chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset + 3]!
  ) * 0.5,
  (
    chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset + 1]!
    + chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset + 4]!
  ) * 0.5,
  (
    chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset + 2]!
    + chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset + 5]!
  ) * 0.5,
);
const axisVectors = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
} as const;
const { upAxis, horizontalAxes } = parsedVegFile.header.coordinateSystem;
const directionalLight = new DirectionalLight('#fff0d1', 1.1);
directionalLight.position.copy(center)
  .addScaledVector(axisVectors[horizontalAxes[0]], sceneRadius * 0.4)
  .addScaledVector(axisVectors[horizontalAxes[1]], -sceneRadius * 0.25)
  .addScaledVector(axisVectors[upAxis], sceneRadius);
directionalLight.target.position.copy(center);
directionalLight.castShadow = renderer.shadowMap.enabled;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.bias = -0.0002;
directionalLight.shadow.normalBias = 0.5;
const shadowExtent = sceneRadius * 1.15;
directionalLight.shadow.camera.left = -shadowExtent;
directionalLight.shadow.camera.right = shadowExtent;
directionalLight.shadow.camera.top = shadowExtent;
directionalLight.shadow.camera.bottom = -shadowExtent;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = sceneRadius * 5;
directionalLight.shadow.camera.updateProjectionMatrix();
directionalLight.shadow.autoUpdate = false;
directionalLight.shadow.needsUpdate = directionalLight.castShadow;
scene.add(directionalLight, directionalLight.target);
const upAxisIndex = upAxis === 'x' ? 0 : upAxis === 'y' ? 1 : 2;
nearChunkCenter.setComponent(
  upAxisIndex,
  chunkBoundingBoxes.minMaxCoordinates[nearChunkOffset + 3 + upAxisIndex]!,
);
const cameraTarget = useNearTestView ? nearChunkCenter : center;
const cameraDistance = useNearTestView
  ? parsedVegFile.header.grid.chunkSize * 0.12
  : sceneRadius;

const cullingCamera = new PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  sceneRadius * 10,
);
cullingCamera.up.copy(axisVectors[upAxis]);
cullingCamera.position.copy(cameraTarget)
  .addScaledVector(axisVectors[horizontalAxes[0]], cameraDistance * 0.9)
  .addScaledVector(axisVectors[horizontalAxes[1]], -cameraDistance * 1.3)
  .addScaledVector(axisVectors[upAxis], cameraDistance);
cullingCamera.lookAt(cameraTarget);

status.remove();
const renderControls = {
  get antialias(): boolean {
    return antialiasEnabled;
  },
  get shadows(): boolean {
    return renderer.shadowMap.enabled;
  },
  get dpr(): number {
    return pixelRatio;
  },
  setAntialias(enabled: boolean): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('noAA');
    if (enabled) url.searchParams.set('aa', '');
    else url.searchParams.delete('aa');
    window.location.assign(url.href);
  },
  setShadows(enabled: boolean): void {
    renderer.shadowMap.enabled = enabled;
    directionalLight.castShadow = enabled;
    directionalLight.shadow.needsUpdate = enabled;
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => { material.needsUpdate = true; });
    });
    const url = new URL(window.location.href);
    if (enabled) url.searchParams.delete('noShadows');
    else url.searchParams.set('noShadows', '');
    window.history.replaceState(null, '', url);
  },
  setDpr(nextDpr: number): void {
    targetWidth = null;
    pixelRatio = nextDpr;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    const url = new URL(window.location.href);
    url.searchParams.delete('resolution');
    url.searchParams.set('dpr', String(pixelRatio));
    window.history.replaceState(null, '', url);
  },
};
const debug = new WebGLVegetationDebug({
  adapter: gpuAdapter, grass, camera: cullingCamera, scene, panelParent: document.body, renderControls,
});

const clipFromModelMatrix = new Matrix4();
const modelFromWorldMatrix = new Matrix4();
const cameraPositionModel = new Vector3();
let previousFrameTime = performance.now();

function render(frameTime = performance.now()): void {
  const deltaSeconds = (frameTime - previousFrameTime) / 1000;
  previousFrameTime = frameTime;
  debug.update(deltaSeconds);
  const visibilityCamera = debug.cullingCamera;
  const cpuStart = performance.now();
  grass.mesh.updateMatrixWorld();
  clipFromModelMatrix
    .multiplyMatrices(visibilityCamera.projectionMatrix, visibilityCamera.matrixWorldInverse)
    .multiply(grass.mesh.matrixWorld);

  const visibleChunkCount = chunkVisibility.updateVisibleChunks(
    clipFromModelMatrix.elements,
    'negative-one-to-one',
  );
  gpuAdapter.updateVisibleChunks(
    chunkVisibility.visibleChunkIndices,
    visibleChunkCount,
  );
  modelFromWorldMatrix.copy(grass.mesh.matrixWorld).invert();
  cameraPositionModel
    .setFromMatrixPosition(visibilityCamera.matrixWorld)
    .applyMatrix4(modelFromWorldMatrix);
  grass.updateDensity(cameraPositionModel, clipFromModelMatrix.elements, 'negative-one-to-one');
  debug.recordFrame(deltaSeconds, performance.now() - cpuStart);
  debug.beginGpuFrame();
  renderer.render(scene, cullingCamera);
  debug.endGpuFrame();
  requestAnimationFrame(render);
}

window.addEventListener('resize', () => {
  if (targetWidth) pixelRatio = targetWidth / window.innerWidth;
  renderer.setPixelRatio(pixelRatio);
  cullingCamera.aspect = window.innerWidth / window.innerHeight;
  cullingCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

render();

function findDensestStoredChunk(
  maskData: Uint32Array,
  maskWordsPerChunk: number,
  storedChunkCount: number,
): number {
  let densestChunkIndex = 0;
  let densestActiveCellCount = -1;
  for (let storedChunkIndex = 0; storedChunkIndex < storedChunkCount; storedChunkIndex += 1) {
    let activeCellCount = 0;
    const maskOffset = storedChunkIndex * maskWordsPerChunk;
    for (let wordIndex = 0; wordIndex < maskWordsPerChunk; wordIndex += 1) {
      let word = maskData[maskOffset + wordIndex]!;
      while (word !== 0) {
        word = (word & (word - 1)) >>> 0;
        activeCellCount += 1;
      }
    }
    if (activeCellCount > densestActiveCellCount) {
      densestActiveCellCount = activeCellCount;
      densestChunkIndex = storedChunkIndex;
    }
  }
  return densestChunkIndex;
}

function createExampleVegetationFile(): ParsedVegFile {
  const maskResolution = 64;
  const maskWordsPerChunk = maskResolution ** 2 / 32;
  return {
    bytes: new Uint8Array(),
    header: {
      version: 1,
      fileSize: 0,
      seed: 42,
      buildFingerprint: new Uint8Array(16),
      fileChecksum: 0,
      sourceBounds: {
        minX: -16, minY: 0, minZ: -16,
        maxX: 16, maxY: 0, maxZ: 16,
      },
      coordinateSystem: {
        upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1,
      },
      grid: { width: 1, height: 1, chunkSize: 32, originX: -16, originY: -16 },
      storedChunkCount: 1,
      heightMap: { resolution: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: Int32Array.of(0),
    chunkHeightRanges: Float32Array.of(0, 0),
    heightData: Uint16Array.of(0, 0, 0, 0),
    layers: [{
      id: 0,
      maskResolution,
      maskWordsPerChunk,
      maskData: new Uint32Array(maskWordsPerChunk).fill(0xffff_ffff),
    }],
  };
}
