import * as THREE from 'three';
import { createPreparedVegetationDataset, grassLayerPreparation, requireGrassRuntimeLayer, WebGLVegetationDatasetTextures, WebGLVisibleStoredChunkTexture, WebGLGrassLayerRenderer } from '../../src/package-entrypoints/InternalDevelopmentApi.ts';
import { groundColorConfig } from '../fixtures/groundColorConfig.ts';

// Run through Vite: /tests/browser/ground-color.html. Pixel reads are numerical
// shader checks, not visual acceptance of a consumer scene.
const result = document.querySelector('#result');
try {
  const config = structuredClone(groundColorConfig);
  const layer = config.layers[0];
  layer.distribution.anchorsPerCell = 1;
  layer.distribution.elementRadiusMeters = 0.35;
  layer.patches.ground.radiusMeters = { minimum: 0.25, maximum: 0.25 };
  layer.patches.ground.edgeFalloffMeters = 0.25;
  layer.renderProfile.blade.heightMeters = { minimum: 1, maximum: 1 };
  layer.renderProfile.blade.widthMeters = { minimum: 0.7, maximum: 0.7 };
  layer.renderProfile.blade.cameraFacing = { startsAtMeters: 0, reachesFullAtMeters: 1 };
  layer.renderProfile.colors.bottomColors = ['#264e20'];
  layer.renderProfile.colors.topColors = ['#b1df78'];
  layer.renderProfile.clover = {
    enabled: true,
    maximumRatio: 0,
    groundColorBias: 1,
    preferredGroundColor: '#3f7d35',
    colorTolerance: 0.2,
    sizeMeters: { minimum: 0.1, maximum: 0.16 },
    heightOffsetMeters: 0.02,
    baseColor: '#3f7d35',
    highlightColor: '#67ad4d',
  };
  const file = {
    header: {
      vegetationSeed: 42, storedChunkCount: 1,
      coordinateSystem: { upAxis: 'y', horizontalAxes: ['x', 'z'], unitsPerMeter: 2 },
      grid: { width: 1, height: 1, chunkSize: 2, originX: 0, originY: 0 },
      heightMap: { resolutionPerChunkAxis: 2, valueBits: 16, valuesPerChunk: 4 },
    },
    chunkLookup: new Int32Array([0]),
    chunkHeightRanges: new Float32Array([0, 0]),
    heightData: new Uint16Array(4),
    layers: [{ vegetationLayerId: 0, maskResolutionPerChunkAxis: 1, maskWordsPerChunk: 1, maskData: new Uint32Array([1]) }],
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
  const dataset = createPreparedVegetationDataset(file, config, [grassLayerPreparation]);
  const vegetationDatasetTextures = new WebGLVegetationDatasetTextures(renderer, dataset);
  const visibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(
    renderer,
    dataset.file.header.storedChunkCount,
  );
  const view = new WebGLGrassLayerRenderer({
    renderer,
    vegetationDataset: dataset,
    vegetationDatasetTextures,
    visibleStoredChunkTexture,
    layer: requireGrassRuntimeLayer(dataset.preparedLayers[0]),
  });
  visibleStoredChunkTexture.update(new Uint32Array([0]), 1);
  view.updateRenderTileSelection({ x: 1, y: 1, z: 10 });
  scene.add(view.object3d);
  renderer.setSize(128, 128, false);
  renderer.render(scene, camera);
  if (renderer.info.programs.some((program) => program.diagnostics?.runnable === false)) {
    throw new Error('Production shader did not compile');
  }
  const cloverConfig = structuredClone(config);
  const cloverLayer = cloverConfig.layers[0];
  cloverLayer.renderProfile.colors.groundColorAdaptation = {
    bottomBias: 0,
    topBias: 0,
  };
  cloverLayer.renderProfile.clover = {
    enabled: true,
    maximumRatio: 1,
    groundColorBias: 0,
    preferredGroundColor: '#3f7d35',
    colorTolerance: 0.2,
    sizeMeters: { minimum: 0.7, maximum: 0.7 },
    heightOffsetMeters: 0.02,
    baseColor: '#ff2400',
    highlightColor: '#00ff3c',
  };
  const cloverDataset = createPreparedVegetationDataset(
    file,
    cloverConfig,
    [grassLayerPreparation],
  );
  const cloverDatasetTextures = new WebGLVegetationDatasetTextures(renderer, cloverDataset);
  const cloverVisibleStoredChunkTexture = new WebGLVisibleStoredChunkTexture(
    renderer,
    cloverDataset.file.header.storedChunkCount,
  );
  const cloverView = new WebGLGrassLayerRenderer({
    renderer,
    vegetationDataset: cloverDataset,
    vegetationDatasetTextures: cloverDatasetTextures,
    visibleStoredChunkTexture: cloverVisibleStoredChunkTexture,
    layer: requireGrassRuntimeLayer(cloverDataset.preparedLayers[0]),
  });
  cloverVisibleStoredChunkTexture.update(new Uint32Array([0]), 1);
  cloverView.updateRenderTileSelection({ x: 1, y: 10, z: 1 });
  const cloverScene = new THREE.Scene();
  cloverScene.add(new THREE.AmbientLight(0xffffff, 2), cloverView.object3d);
  const cloverCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  cloverCamera.position.set(1, 10, 1);
  cloverCamera.up.set(0, 0, -1);
  cloverCamera.lookAt(1, 0, 1);
  const cloverTarget = new THREE.WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(cloverTarget);
  renderer.clear();
  renderer.render(cloverScene, cloverCamera);
  if (renderer.info.programs.some((program) => program.diagnostics?.runnable === false)) {
    throw new Error('Clover cutout shader did not compile');
  }
  const cloverPixels = new Uint8Array(128 * 128 * 4);
  renderer.readRenderTargetPixels(cloverTarget, 0, 0, 128, 128, cloverPixels);
  let cloverPixelCount = 0;
  let basePixelCount = 0;
  let highlightPixelCount = 0;
  let minimumCloverX = 128;
  let maximumCloverX = -1;
  let minimumCloverY = 128;
  let maximumCloverY = -1;
  for (let index = 0; index < cloverPixels.length; index += 4) {
    if (cloverPixels[index + 3] === 0) continue;
    const pixelIndex = index / 4;
    const x = pixelIndex % 128;
    const y = Math.floor(pixelIndex / 128);
    cloverPixelCount++;
    minimumCloverX = Math.min(minimumCloverX, x);
    maximumCloverX = Math.max(maximumCloverX, x);
    minimumCloverY = Math.min(minimumCloverY, y);
    maximumCloverY = Math.max(maximumCloverY, y);
    if (cloverPixels[index] > cloverPixels[index + 1] * 1.2) basePixelCount++;
    if (cloverPixels[index + 1] > cloverPixels[index] * 1.2) highlightPixelCount++;
  }
  let cutoutPixelCount = 0;
  for (let y = minimumCloverY; y <= maximumCloverY; y++) {
    for (let x = minimumCloverX; x <= maximumCloverX; x++) {
      if (cloverPixels[(y * 128 + x) * 4 + 3] === 0) cutoutPixelCount++;
    }
  }
  if (!cloverPixelCount || !basePixelCount || !highlightPixelCount || !cutoutPixelCount) {
    throw new Error(`Clover cutout or two-color mask failed: ${JSON.stringify({
      cloverPixelCount,
      basePixelCount,
      highlightPixelCount,
      cutoutPixelCount,
    })}`);
  }
  cloverView.dispose();
  cloverVisibleStoredChunkTexture.dispose();
  cloverDatasetTextures.dispose();
  cloverTarget.dispose();
  renderer.setRenderTarget(null);
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
  const firstCandidateCapacityMaterial = view.candidateCapacityDraws[0].material;
  if (!firstCandidateCapacityMaterial.uniforms.ambientLightColor.value.length
    || !firstCandidateCapacityMaterial.uniforms.hemisphereLights.value.length
    || !firstCandidateCapacityMaterial.uniforms.directionalLights.value.length
    || !firstCandidateCapacityMaterial.uniforms.directionalLightShadows.value.length) {
    throw new Error('Three.js scene light or shadow uniforms are incomplete');
  }
  keyLight.color.set(0xff0000);
  keyLight.intensity = 0.25;
  renderer.render(scene, camera);
  const redDirectional = firstCandidateCapacityMaterial
    .uniforms.directionalLights.value[0].color.clone();
  keyLight.color.set(0x0000ff);
  renderer.render(scene, camera);
  const blueDirectional = firstCandidateCapacityMaterial.uniforms.directionalLights.value[0].color;
  if (redDirectional.r <= redDirectional.b || blueDirectional.b <= blueDirectional.r) {
    throw new Error('Scene light changes require an unexpected manual vegetation sync');
  }
  view.candidateCapacityDraws.forEach((draw) => { draw.mesh.receiveShadow = false; });
  renderer.render(scene, camera);
  view.candidateCapacityDraws.forEach((draw) => { draw.mesh.receiveShadow = true; });
  renderer.render(scene, camera);
  if (renderer.info.programs.some((program) => program.diagnostics?.runnable === false)) {
    throw new Error('Shadow receive variants did not compile');
  }
  const target = new THREE.WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const field = requireGrassRuntimeLayer(
    dataset.preparedLayers[0],
  ).preparedProfileData.groundPatchField;
  const texture = view.layerResources.groundPatchField.texture;
  const checks = [];
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const offset = (y * field.width + x) * 2;
      field.data[offset] = 255;
      field.data[offset + 1] = (x + y) % 2 === 0 ? 0 : 255;
    }
  }
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  for (const { material } of view.candidateCapacityDraws) {
    material.uniforms.groundColorBias.value.set(1, 1);
    material.vertexShader = firstCandidateCapacityMaterial.vertexShader
      .replace(
        'flat out vec3 bladeBottomColor;',
        'flat out vec3 bladeBottomColor;\nflat out vec2 testGroundModelPosition;',
      )
      .replace(
        'vec2 horizontalPosition = chunkMinimum + chunkUv * chunkSize;',
        `vec2 horizontalPosition = chunkMinimum + chunkUv * chunkSize;
testGroundModelPosition = horizontalPosition;`,
      );
    material.fragmentShader = `precision highp float;
      uniform sampler2D groundPatchField;
      uniform vec3 groundBaseColor;
      uniform float groundBrightnessVariation;
      uniform vec2 groundOrigin;
      uniform vec2 groundExtent;
      flat in vec3 bladeBottomColor;
      flat in vec2 testGroundModelPosition;
      out vec4 outputColor;
      void main() {
        vec2 patchUv = (testGroundModelPosition - groundOrigin) / groundExtent;
        vec2 patchValue = texture(groundPatchField, patchUv).rg;
        float patchInBounds = step(0.0, patchUv.x) * step(0.0, patchUv.y)
          * step(patchUv.x, 1.0) * step(patchUv.y, 1.0);
        float patchBrightness = 1.0 + groundBrightnessVariation
          * patchValue.r * patchInBounds * (patchValue.g * 2.0 - 1.0);
        vec3 groundFragmentColor = clamp(
          groundBaseColor * patchBrightness,
          vec3(0.0),
          vec3(1.0)
        );
        outputColor = vec4(abs(bladeBottomColor - groundFragmentColor), 1.0);
      }`;
    material.needsUpdate = true;
  }
  renderer.render(scene, camera);
  const spatialPixels = new Uint8Array(128 * 128 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 128, 128, spatialPixels);
  let spatialPixelCount = 0;
  let maximumSpatialError = 0;
  for (let index = 0; index < spatialPixels.length; index += 4) {
    if (spatialPixels[index + 3] === 0) continue;
    spatialPixelCount++;
    maximumSpatialError = Math.max(
      maximumSpatialError,
      spatialPixels[index] / 255,
      spatialPixels[index + 1] / 255,
      spatialPixels[index + 2] / 255,
    );
  }
  if (!spatialPixelCount || maximumSpatialError > 2 / 255) {
    throw new Error(`Ground/Grass model-coordinate mismatch: ${JSON.stringify({
      fieldSize: [field.width, field.height],
      spatialPixelCount,
      maximumSpatialError,
    })}`);
  }
  for (const { material } of view.candidateCapacityDraws) {
    material.uniforms.groundColorBias.value.set(
      layer.renderProfile.colors.groundColorAdaptation.bottomBias,
      layer.renderProfile.colors.groundColorAdaptation.topBias,
    );
  }
  const assertColor = (distance, endpoint, variationByte) => {
    for (let i = 0; i < field.data.length; i += 2) {
      field.data[i] = 255;
      field.data[i + 1] = variationByte;
    }
    texture.needsUpdate = true;
    for (const { material } of view.candidateCapacityDraws) {
      material.uniforms.testDistanceMeters = { value: distance };
      material.vertexShader = firstCandidateCapacityMaterial.vertexShader;
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
    const ground = new THREE.Color(field.baseColor).multiplyScalar(1 + field.brightnessVariation * (variationByte / 255 * 2 - 1));
    const startBias = layer.renderProfile.colors.groundColorAdaptation[`${endpoint}Bias`];
    const curve = layer.renderProfile.colors.distanceColorTransition[endpoint];
    const ratio = THREE.MathUtils.clamp((distance - curve.startsAtMeters) / (curve.endsAtMeters - curve.startsAtMeters), 0, 1);
    const fade = curve.curveStrength < 0.001
      ? ratio
      : -Math.expm1(-curve.curveStrength * ratio) / -Math.expm1(-curve.curveStrength);
    const effectiveBias = THREE.MathUtils.lerp(startBias, 1, fade);
    const expected = new THREE.Color(layer.renderProfile.colors[`${endpoint}Colors`][0])
      .lerp(ground, effectiveBias)
      .toArray();
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
      throw new Error(JSON.stringify({ distance, endpoint, variationByte, count, maximumError, expected }));
    }
    checks.push({ distance, endpoint, variationByte, pixels: count, maximumError });
  };
  for (const endpoint of ['bottom', 'top']) {
    for (const variation of [0, 255]) {
      for (const distance of [0, 30, 60, 90, 120, 180, 240]) {
        assertColor(distance, endpoint, variation);
      }
    }
  }
  layer.renderProfile.colors.groundColorAdaptation = { bottomBias: 1, topBias: 1 };
  for (const { material } of view.candidateCapacityDraws) {
    material.uniforms.groundColorBias.value.set(1, 1);
  }
  for (const [startsAtMeters, endsAtMeters] of [[50, 100], [1, 2]]) {
    for (const endpoint of ['bottom', 'top']) {
      layer.renderProfile.colors.distanceColorTransition[endpoint] = {
        startsAtMeters, endsAtMeters, curveStrength: 1,
      };
      for (const { material } of view.candidateCapacityDraws) {
        material.uniforms[`${endpoint}GroundTransition`].value.set(
          startsAtMeters,
          endsAtMeters,
          1,
        );
      }
      for (const variation of [0, 255]) assertColor(10, endpoint, variation);
    }
  }
  if (renderer.getContext().getError() !== 0) throw new Error('WebGL error');
  result.textContent = JSON.stringify({
    status: 'PASS',
    productionShader: true,
    cloverShader: {
      triangleCutout: true,
      twoColorMask: true,
      pixels: cloverPixelCount,
      basePixels: basePixelCount,
      highlightPixels: highlightPixelCount,
      cutoutPixels: cutoutPixelCount,
    },
    separateGroundColorAdaptationAndFade: true,
    biasOneCurveInvariant: true,
    groundColorBias: layer.renderProfile.colors.groundColorAdaptation,
    spatialGroundGrassMatch: {
      fieldSize: [field.width, field.height],
      pixels: spatialPixelCount,
      maximumError: maximumSpatialError,
    },
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
  view.dispose();
  visibleStoredChunkTexture.dispose();
  vegetationDatasetTextures.dispose();
  target.dispose();
  renderer.dispose();
} catch (error) {
  result.textContent = `FAIL: ${error.stack}`;
  console.error(error);
}
