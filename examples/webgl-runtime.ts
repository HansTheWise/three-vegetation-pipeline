import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

import {
  createThreeVegetation,
  writeVegFile,
  type VegetationDataset,
} from '../src/index.js';
import { vegetationExampleConfig } from './vegetationExampleConfig.js';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.append(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#9bc4dc');
const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8, 6, 8);
camera.lookAt(0, 0, 0);
scene.add(new AmbientLight('#ffffff', 0.6));
const sun = new DirectionalLight('#fff4df', 1.2);
sun.position.set(4, 8, 2);
scene.add(sun);
const ground = new Mesh(
  new PlaneGeometry(16, 16),
  new MeshLambertMaterial({ color: '#527d3d', side: DoubleSide }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const vegetation = await createThreeVegetation({
  renderer,
  scene,
  camera,
  source: createExampleVegetationBytes(),
  config: vegetationExampleConfig,
});

function render(): void {
  vegetation.updateFrame();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('pagehide', () => {
  vegetation.dispose();
  renderer.dispose();
}, { once: true });

/** Creates an in-memory demo asset; applications normally fetch their compiled .veg file. */
function createExampleVegetationBytes(): Uint8Array {
  const maskResolution = 32;
  const maskData = new Uint8Array(maskResolution ** 2).fill(1);
  const dataset: VegetationDataset = {
    sourceBounds: {
      minX: -8, minY: 0, minZ: -8,
      maxX: 8, maxY: 0, maxZ: 8,
    },
    coordinateSystem: {
      upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 1,
    },
    seed: 42,
    grid: { width: 1, height: 1, chunkSize: 16, originX: -8, originY: -8 },
    heightMap: { resolution: 2 },
    chunkLookup: Int32Array.of(0),
    chunks: [{ gridX: 0, gridY: 0, minimumHeight: 0, maximumHeight: 0 }],
    heightData: Float64Array.of(0, 0, 0, 0),
    layers: [{
      id: 0,
      key: 'grass',
      displayName: 'Grass',
      maskResolution,
      activeCellCount: maskData.length,
      maskData,
    }],
  };
  return writeVegFile(
    dataset,
    { heightValueBits: 16 },
    { buildFingerprint: new Uint8Array(16) },
  );
}
