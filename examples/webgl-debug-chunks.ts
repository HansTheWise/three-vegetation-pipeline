import {
  ACESFilmicToneMapping,
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  createChunkBoundingBoxes,
  createVegetationRuntimeDataset,
  FrustumChunkVisibility,
  parseVegFile,
  WebGLDebugChunkView,
  WebGLGrassView,
  WebGLVegetationAdapter,
} from '../src/index.js';
import { CameraFrustumVisualization } from './debug/CameraFrustumVisualization.js';
import { createChunkBoundingBoxOutlines } from './debug/createChunkBoundingBoxOutlines.js';
import { FirstPersonCameraController } from './debug/FirstPersonCameraController.js';
import { icakaVegetationRuntimeConfig } from '../config/icaka.vegetation.runtime.config.js';

const status = document.querySelector<HTMLDivElement>('#status');
if (!status) throw new Error('Debug status element is missing.');

const renderer = new WebGLRenderer({ antialias: false });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.append(renderer.domElement);

const response = await fetch('/campus.veg');
if (!response.ok) throw new Error(`campus.veg could not be loaded: ${response.status}`);
const parsedVegFile = parseVegFile(new Uint8Array(await response.arrayBuffer()));
const runtimeDataset = createVegetationRuntimeDataset(
  parsedVegFile,
  icakaVegetationRuntimeConfig,
);
const gpuAdapter = new WebGLVegetationAdapter(
  renderer,
  runtimeDataset,
);
const chunkBoundingBoxes = createChunkBoundingBoxes(parsedVegFile);
const chunkVisibility = new FrustumChunkVisibility(
  chunkBoundingBoxes,
);
const debugChunks = new WebGLDebugChunkView(gpuAdapter);
const grass = new WebGLGrassView(gpuAdapter, 0);

const scene = new Scene();
scene.background = new Color('#9bc4dc');
scene.add(grass.mesh);
scene.add(debugChunks.mesh);
debugChunks.mesh.visible = false;
const campusModel = await new GLTFLoader().loadAsync('/campus.glb');
campusModel.scene.traverse((object) => {
  if (!(object instanceof Mesh)) return;
  object.castShadow = false;
  object.receiveShadow = true;
});
scene.add(campusModel.scene);
const ambientLight = new AmbientLight('#b9c9df', 0.45);
scene.add(ambientLight);
scene.add(new AxesHelper(parsedVegFile.header.grid.chunkSize));
const boundingBoxOutlines = createChunkBoundingBoxOutlines(chunkBoundingBoxes);
boundingBoxOutlines.visible = false;
scene.add(boundingBoxOutlines);
const cullingFrustum = new CameraFrustumVisualization();
scene.add(cullingFrustum.group);

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
scene.add(directionalLight, directionalLight.target);
grass.setLighting(
  directionalLight.position.clone().sub(center).normalize(),
  ambientLight.color.clone().multiplyScalar(ambientLight.intensity),
  directionalLight.color.clone().multiplyScalar(directionalLight.intensity),
);
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

let activeCamera = cullingCamera;
let observerCamera: PerspectiveCamera | null = null;
const cameraController = new FirstPersonCameraController({
  camera: cullingCamera,
  canvas: renderer.domElement,
  upAxis: axisVectors[upAxis],
  horizontalForwardAxis: axisVectors[horizontalAxes[1]],
  movementSpeed: parsedVegFile.header.grid.chunkSize * 1.5,
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;

  if (event.code === 'KeyG') {
    debugChunks.mesh.visible = !debugChunks.mesh.visible;
    return;
  } else if (event.code === 'KeyB') {
    boundingBoxOutlines.visible = !boundingBoxOutlines.visible;
    return;
  } else if (event.code !== 'KeyC') return;
  else if (observerCamera) {
    observerCamera = null;
    activeCamera = cullingCamera;
    cameraController.setCamera(cullingCamera);
    cullingFrustum.group.visible = false;
  } else {
    observerCamera = cullingCamera.clone();
    activeCamera = observerCamera;
    cameraController.setCamera(observerCamera);
    cullingFrustum.group.visible = true;
  }
});

const clipFromModelMatrix = new Matrix4();
const modelFromWorldMatrix = new Matrix4();
const cameraPositionModel = new Vector3();
let previousFrameTime = performance.now();
let fpsSampleStart = previousFrameTime;
let fpsSampleFrameCount = 0;
let measuredFps = 0;

function render(frameTime = performance.now()): void {
  const deltaSeconds = Math.min((frameTime - previousFrameTime) / 1000, 0.1);
  previousFrameTime = frameTime;
  cameraController.update(deltaSeconds);
  activeCamera.updateMatrixWorld();
  cullingCamera.updateMatrixWorld();
  grass.mesh.updateMatrixWorld();
  clipFromModelMatrix
    .multiplyMatrices(cullingCamera.projectionMatrix, cullingCamera.matrixWorldInverse)
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
    .setFromMatrixPosition(cullingCamera.matrixWorld)
    .applyMatrix4(modelFromWorldMatrix);
  grass.updateLod(cameraPositionModel);
  cullingFrustum.update(cullingCamera);
  updateFps(frameTime);

  status!.textContent = [
    `FPS: ${measuredFps.toFixed(1)}`,
    `Kamera: ${observerCamera ? 'Beobachter (Culling-Kamera eingefroren)' : 'Culling-Kamera'}`,
    `Sichtbare Chunks: ${visibleChunkCount}/${parsedVegFile.header.storedChunkCount}`,
    `Aktive Render-Tiles: ${grass.visibleTileCount}`,
    `LOD-Tiles: ${grass.lodDraws
      .map((draw) => draw.tileBuffer.visibleTileCount)
      .join(' / ')}`,
    `LOD-Cells je Tile: ${grass.lodDraws
      .map((draw) => draw.cellCount)
      .join(' / ')}`,
    `Gerenderte Halmkandidaten: ${grass.visibleCandidateCount.toLocaleString('de-DE')}`,
    `Maximale Halmkandidaten je Chunk: ${grass.candidatesPerVisibleChunk.toLocaleString('de-DE')}`,
    'Klick: Maus fangen · Maus: umsehen · Esc: Maus freigeben',
    'WASD: bewegen · Leertaste: hoch · Shift: runter · C: Kamera wechseln',
    `G: Cell-Debugfläche ${debugChunks.mesh.visible ? 'ausblenden' : 'einblenden'}`,
    `B: Chunk-Boxen ${boundingBoxOutlines.visible ? 'ausblenden' : 'einblenden'}`,
  ].join('\n');
  renderer.render(scene, activeCamera);
  requestAnimationFrame(render);
}

function updateFps(frameTime: number): void {
  fpsSampleFrameCount += 1;
  const elapsedMilliseconds = frameTime - fpsSampleStart;
  if (elapsedMilliseconds < 1_000) return;
  measuredFps = fpsSampleFrameCount * 1_000 / elapsedMilliseconds;
  fpsSampleFrameCount = 0;
  fpsSampleStart = frameTime;
}

window.addEventListener('resize', () => {
  cullingCamera.aspect = window.innerWidth / window.innerHeight;
  cullingCamera.updateProjectionMatrix();
  if (observerCamera) {
    observerCamera.aspect = window.innerWidth / window.innerHeight;
    observerCamera.updateProjectionMatrix();
  }
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
