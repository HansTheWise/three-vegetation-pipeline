import * as THREE from 'three';
import { createVegetationRuntimeDataset, requireGrassRuntimeLayer, WebGLVegetationAdapter, WebGLGrassView } from '../../src/index.ts';
import { groundColorConfig } from '../fixtures/groundColorConfig.ts';

// Run through Vite: /tests/browser/ground-color.html. Pixel reads are numerical
// shader checks, not visual acceptance of a consumer scene.
const result = document.querySelector('#result');
try {
  const config = structuredClone(groundColorConfig);
  const layer = config.layers[0];
  layer.distribution.anchorsPerCell = 1;
  layer.renderProfile.blade.heightMeters = { minimum: 1, maximum: 1 };
  layer.renderProfile.blade.widthMeters = { minimum: 0.7, maximum: 0.7 };
  layer.renderBounds.aboveSurfaceMeters = 1;
  layer.renderBounds.horizontalPaddingMeters = 2;
  layer.renderProfile.blade.cameraFacing = { startsAtMeters: 0, reachesFullAtMeters: 1 };
  layer.renderProfile.colors.bottomColors = ['#264e20'];
  layer.renderProfile.colors.topColors = ['#b1df78'];
  layer.renderProfile.colors.distanceColorTransition.bottom = { startsAtMeters: 30, endsAtMeters: 120, curveStrength: 0 };
  layer.renderProfile.colors.distanceColorTransition.top = { startsAtMeters: 60, endsAtMeters: 180, curveStrength: 2 };
  const file = {
    header: {
      seed: 42, storedChunkCount: 1,
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 2 },
      grid: { width: 1, height: 1, chunkSize: 2, originX: 0, originY: 0 },
      heightMap: { resolution: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: new Int32Array([0]),
    chunkHeightRanges: new Float32Array([0, 0]),
    heightData: new Uint16Array(4),
    layers: [{ id: 0, maskResolution: 1, maskWordsPerChunk: 1, maskData: new Uint32Array([1]) }],
  };
  const renderer = new THREE.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
  const hemisphereLight = new THREE.HemisphereLight(0xc7e4ff, 0x737866, 0.1);
  scene.add(ambientLight, hemisphereLight);
  const keyLight = new THREE.DirectionalLight(0xfff8ea, 0.1);
  keyLight.position.set(2, 4, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(128, 128);
  scene.add(keyLight, keyLight.target);
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
  camera.position.set(1, 1, 10);
  camera.lookAt(1, 1, 0);
  const dataset = createVegetationRuntimeDataset(file, config);
  const adapter = new WebGLVegetationAdapter(renderer, dataset);
  const view = new WebGLGrassView(adapter, 0);
  adapter.updateVisibleChunks(new Uint32Array([0]), 1);
  view.updateDensity({ x: 1, y: 1, z: 10 });
  scene.add(view.mesh);
  renderer.setSize(128, 128, false);
  renderer.render(scene, camera);
  if (renderer.info.programs.some((program) => program.diagnostics?.runnable === false)) {
    throw new Error('Production shader did not compile');
  }
  const averageRenderedLight = () => {
    const pixels = new Uint8Array(128 * 128 * 4);
    renderer.getContext().readPixels(
      0, 0, 128, 128,
      renderer.getContext().RGBA,
      renderer.getContext().UNSIGNED_BYTE,
      pixels,
    );
    let channels = 0;
    let sum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      sum += pixels[index] + pixels[index + 1] + pixels[index + 2];
      channels += 3;
    }
    if (channels === 0) throw new Error('Lighting check rendered no Grass pixels');
    return sum / channels;
  };
  const lowExposureLight = averageRenderedLight();
  renderer.toneMappingExposure = 2;
  renderer.render(scene, camera);
  const highExposureLight = averageRenderedLight();
  if (highExposureLight <= lowExposureLight) {
    throw new Error(`Renderer exposure did not reach the vegetation material: ${JSON.stringify({ lowExposureLight, highExposureLight })}`);
  }
  if (!view.material.uniforms.ambientLightColor.value.length
    || !view.material.uniforms.hemisphereLights.value.length
    || !view.material.uniforms.directionalLights.value.length
    || !view.material.uniforms.directionalLightShadows.value.length) {
    throw new Error('Three.js scene light or shadow uniforms are incomplete');
  }
  keyLight.color.set(0xff0000);
  keyLight.intensity = 0.25;
  renderer.render(scene, camera);
  const redDirectional = view.material.uniforms.directionalLights.value[0].color.clone();
  keyLight.color.set(0x0000ff);
  renderer.render(scene, camera);
  const blueDirectional = view.material.uniforms.directionalLights.value[0].color;
  if (redDirectional.r <= redDirectional.b || blueDirectional.b <= blueDirectional.r) {
    throw new Error('Scene light changes require an unexpected manual vegetation sync');
  }
  view.densityDraws.forEach((draw) => { draw.mesh.receiveShadow = false; });
  renderer.render(scene, camera);
  view.densityDraws.forEach((draw) => { draw.mesh.receiveShadow = true; });
  renderer.render(scene, camera);
  if (renderer.info.programs.some((program) => program.diagnostics?.runnable === false)) {
    throw new Error('Shadow receive variants did not compile');
  }
  const target = new THREE.WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const field = requireGrassRuntimeLayer(dataset.enabledLayers[0]).profileData.groundPatchField;
  const texture = view.resources.groundPatchField.texture;
  const checks = [];
  const assertColor = (distance, endpoint, variationByte, strength) => {
    for (let i = 0; i < field.data.length; i += 2) {
      field.data[i] = 255;
      field.data[i + 1] = variationByte;
    }
    texture.needsUpdate = true;
    for (const { material } of view.densityDraws) {
      material.uniforms.testDistanceMeters = { value: distance };
      material.uniforms[`${endpoint}GroundTransition`].value.z = strength;
      material.vertexShader = view.material.vertexShader;
      material.vertexShader = material.vertexShader.replace(
        'cameraDistanceMeters = distance(basePosition, cameraPositionModel) / unitsPerMeter;',
        'cameraDistanceMeters = testDistanceMeters;',
      );
      if (!material.vertexShader.includes('uniform float testDistanceMeters;')) {
        material.vertexShader = `uniform float testDistanceMeters;\n${material.vertexShader}`;
      }
      material.fragmentShader = `precision highp float;
        flat in vec3 bladeBottomColor; flat in vec3 bladeTopColor;
        out vec4 outputColor;
        void main() { outputColor = vec4(${endpoint === 'bottom' ? 'bladeBottomColor' : 'bladeTopColor'}, 1.0); }`;
      material.needsUpdate = true;
    }
    renderer.render(scene, camera);
    const pixels = new Uint8Array(128 * 128 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
    const curve = layer.renderProfile.colors.distanceColorTransition[endpoint];
    const ratio = THREE.MathUtils.clamp((distance - curve.startsAtMeters) / (curve.endsAtMeters - curve.startsAtMeters), 0, 1);
    const progress = strength < 0.001 ? ratio : -Math.expm1(-strength * ratio) / -Math.expm1(-strength);
    const ground = new THREE.Color(field.baseColor).multiplyScalar(1 + field.brightnessVariation * (variationByte / 255 * 2 - 1));
    const expected = new THREE.Color(layer.renderProfile.colors[`${endpoint}Colors`][0]).lerp(ground, progress).toArray();
    let count = 0;
    let maximumError = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) continue;
      count++;
      for (let channel = 0; channel < 3; channel++) {
        maximumError = Math.max(maximumError, Math.abs(pixels[i + channel] / 255 - expected[channel]));
      }
    }
    if (!count || maximumError > 2 / 255) {
      throw new Error(JSON.stringify({ distance, endpoint, variationByte, strength, count, maximumError, expected }));
    }
    checks.push({ distance, endpoint, variationByte, strength, pixels: count, maximumError });
  };
  for (const endpoint of ['bottom', 'top']) {
    for (const variation of [0, 255]) {
      for (const strength of [0, 0.000001, 1, 8]) {
        for (const distance of [0, 30, 60, 90, 120, 180, 240]) {
          assertColor(distance, endpoint, variation, strength);
        }
      }
    }
  }
  if (renderer.getContext().getError() !== 0) throw new Error('WebGL error');
  result.textContent = JSON.stringify({
    status: 'PASS',
    productionShader: true,
    lighting: {
      ambient: true,
      hemisphere: true,
      directional: true,
      sceneUpdatesWithoutSync: true,
      shadowsOnOff: true,
      exposure: { low: lowExposureLight, high: highExposureLight },
    },
    checks: checks.length,
    maximumError: Math.max(...checks.map((check) => check.maximumError)),
  }, null, 2);
  view.dispose(); adapter.dispose(); target.dispose(); renderer.dispose();
} catch (error) {
  result.textContent = `FAIL: ${error.stack}`;
  console.error(error);
}
