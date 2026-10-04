import { PerspectiveCamera, Vector2, Vector3, type Object3D } from 'three';

import { CameraFrustumVisualization } from '../runtime-inspection/CameraFrustumVisualization.js';
import { createStoredChunkCullingBoundsOutlines } from '../runtime-inspection/createStoredChunkCullingBoundsOutlines.js';
import { FirstPersonCameraController } from '../runtime-inspection/FirstPersonCameraController.js';
import { WebGLGpuFrameTimer } from '../runtime-inspection/WebGLGpuFrameTimer.js';
import { createDatasetStoredChunkCullingBounds } from '../../runtime/chunk-visibility-management/chunk-culling-bounds/StoredChunkCullingBounds.js';
import type { WebGLGrassLayerRenderer } from '../../layer-profiles/grass/grass-webgl-rendering/WebGLGrassLayerRenderer.js';
import { WebGLGrassChunkCellDebugView } from './WebGLGrassChunkCellDebugView.js';

const MAXIMUM_CAMERA_UPDATE_DELTA_SECONDS = 0.1;
const DIAGNOSTIC_UPDATE_INTERVAL_SECONDS = 0.5;
const MILLISECONDS_PER_SECOND = 1_000;
const DEFAULT_PANEL_TOP_OFFSET_PIXELS = 8;
const PANEL_EDGE_OFFSET_PIXELS = 8;
const CAMERA_MOVEMENT_SPEED_IN_CHUNKS_PER_SECOND = 1.5;
const UNIT_CUBE_DIAGONAL_LENGTH = Math.sqrt(3);

const CORE_DEBUG_ACTIONS = ['vegetation', 'cells', 'boxes', 'freeze'] as const;
const RENDER_CONTROL_DEBUG_ACTIONS = [
  'aa',
  'shadows',
  'dpr-0.5',
  'dpr-1',
  'dpr-1.5',
  'dpr-2',
] as const;
const KEYBOARD_DEBUG_ACTIONS: Readonly<Record<string, string>> = {
  KeyG: 'cells',
  KeyB: 'boxes',
  KeyC: 'freeze',
};

export type WebGLGrassDebugRenderControls = Readonly<{
  antialias: boolean;
  shadows: boolean;
  dpr: number;
  setAntialias(enabled: boolean): void;
  setShadows(enabled: boolean): void;
  setDpr(dpr: number): void;
}>;

export type WebGLGrassDebugOptions = Readonly<{
  grassRenderer: WebGLGrassLayerRenderer;
  camera: PerspectiveCamera;
  /** World-space parent, outside any transformed model group. */
  scene: Object3D;
  panelParent: HTMLElement;
  /** Reserve space for a host application's persistent header. */
  panelTopOffsetPx?: number;
  renderControls?: WebGLGrassDebugRenderControls;
}>;

/** Optional Grass diagnostics. The host retains ownership of rendering and runtime resources. */
export class WebGLGrassDebug {
  readonly grassChunkCellView: WebGLGrassChunkCellDebugView;
  readonly storedChunkCullingBoundsOutlines: ReturnType<
    typeof createStoredChunkCullingBoundsOutlines
  >;
  readonly cullingFrustumVisualization = new CameraFrustumVisualization();
  readonly debugPanelElement: HTMLDivElement;

  readonly #diagnosticStatusElement: HTMLPreElement;
  readonly #cameraController: FirstPersonCameraController;
  readonly #debugOptions: WebGLGrassDebugOptions;
  readonly #actionButtons: HTMLButtonElement[] = [];
  readonly #drawingBufferSize = new Vector2();
  readonly #gpuFrameTimer: WebGLGpuFrameTimer;
  #frozenCullingCamera: PerspectiveCamera | null = null;
  #sampleDurationSeconds = 0;
  #sampleFrameCount = 0;
  #sampleVegetationCpuDurationMilliseconds = 0;

  constructor(options: WebGLGrassDebugOptions) {
    this.#debugOptions = options;
    const { grassRenderer, camera, scene, panelParent } = options;
    const { renderer, vegetationDataset } = grassRenderer;
    this.#gpuFrameTimer = new WebGLGpuFrameTimer(renderer.getContext());

    this.grassChunkCellView = new WebGLGrassChunkCellDebugView(
      grassRenderer,
    );
    this.grassChunkCellView.mesh.visible = false;
    this.storedChunkCullingBoundsOutlines = createStoredChunkCullingBoundsOutlines(
      createDatasetStoredChunkCullingBounds(vegetationDataset),
    );
    this.storedChunkCullingBoundsOutlines.visible = false;
    grassRenderer.object3d.add(
      this.grassChunkCellView.mesh,
      this.storedChunkCullingBoundsOutlines,
    );
    scene.add(this.cullingFrustumVisualization.group);

    const diagnosticObjects = [
      this.grassChunkCellView.mesh,
      this.storedChunkCullingBoundsOutlines,
      this.cullingFrustumVisualization.group,
    ];
    for (const diagnosticObject of diagnosticObjects) {
      diagnosticObject.traverse((object) => { object.raycast = () => undefined; });
    }

    grassRenderer.object3d.updateWorldMatrix(true, false);
    const modelAxes = {
      x: new Vector3(1, 0, 0),
      y: new Vector3(0, 1, 0),
      z: new Vector3(0, 0, 1),
    };
    const { coordinateSystem, grid } = vegetationDataset.file.header;
    const grassModelWorldScale = grassRenderer.object3d.getWorldScale(new Vector3()).length()
      / UNIT_CUBE_DIAGONAL_LENGTH;
    this.#cameraController = new FirstPersonCameraController({
      camera,
      canvas: renderer.domElement,
      upAxis: modelAxes[coordinateSystem.upAxis].clone()
        .transformDirection(grassRenderer.object3d.matrixWorld),
      horizontalForwardAxis: modelAxes[coordinateSystem.horizontalAxes[1]].clone()
        .transformDirection(grassRenderer.object3d.matrixWorld),
      movementSpeed: grid.chunkSize
        * CAMERA_MOVEMENT_SPEED_IN_CHUNKS_PER_SECOND
        * grassModelWorldScale,
    });

    this.debugPanelElement = document.createElement('div');
    this.debugPanelElement.dataset.grassDebug = 'true';
    const panelTopOffsetPixels = options.panelTopOffsetPx ?? DEFAULT_PANEL_TOP_OFFSET_PIXELS;
    const maximumPanelHeightOffsetPixels = panelTopOffsetPixels + PANEL_EDGE_OFFSET_PIXELS;
    this.debugPanelElement.style.cssText = `position:absolute;right:${PANEL_EDGE_OFFSET_PIXELS}px;top:${panelTopOffsetPixels}px;z-index:20;max-width:calc(100% - 16px);max-height:calc(100% - ${maximumPanelHeightOffsetPixels}px);overflow:auto;padding:10px;background:#101827e8;color:#fff;font:12px monospace;pointer-events:auto`;

    const actionButtonContainer = document.createElement('div');
    actionButtonContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    const visibleDebugActions: string[] = [...CORE_DEBUG_ACTIONS];
    if (options.renderControls) visibleDebugActions.push(...RENDER_CONTROL_DEBUG_ACTIONS);
    for (const debugAction of visibleDebugActions) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.dataset.action = debugAction;
      actionButton.style.cssText = 'padding:4px 6px;background:#243448;color:white;border:1px solid #718096;border-radius:3px;cursor:pointer';
      this.#actionButtons.push(actionButton);
      actionButtonContainer.append(actionButton);
    }

    this.#diagnosticStatusElement = document.createElement('pre');
    this.#diagnosticStatusElement.style.cssText = 'margin:8px 0 0;white-space:pre-wrap';
    this.debugPanelElement.append(actionButtonContainer, this.#diagnosticStatusElement);
    this.debugPanelElement.addEventListener('click', this.#handlePanelClick);
    window.addEventListener('keydown', this.#handleDebugKeyDown);
    panelParent.append(this.debugPanelElement);
    this.#refreshActionButtonLabels();
  }

  get cullingCamera(): PerspectiveCamera {
    return this.#frozenCullingCamera ?? this.#debugOptions.camera;
  }

  toggleCullingFreeze(): void {
    this.#debugOptions.camera.updateMatrixWorld();
    this.#frozenCullingCamera = this.#frozenCullingCamera
      ? null
      : this.#debugOptions.camera.clone();
    this.cullingFrustumVisualization.group.visible = this.#frozenCullingCamera !== null;
    if (this.#frozenCullingCamera) {
      this.cullingFrustumVisualization.update(this.#frozenCullingCamera);
    }
    this.#refreshActionButtonLabels();
  }

  /** Updates only the debug camera controller; runtime culling remains host-controlled. */
  updateCameraController(deltaSeconds: number): void {
    this.#cameraController.update(Math.min(
      deltaSeconds,
      MAXIMUM_CAMERA_UPDATE_DELTA_SECONDS,
    ));
    this.#debugOptions.camera.updateMatrixWorld();
  }

  /** Records host-measured vegetation CPU time and periodically refreshes the panel. */
  recordFrameDiagnostics(
    deltaSeconds: number,
    vegetationCpuDurationMilliseconds: number,
  ): void {
    this.#sampleDurationSeconds += deltaSeconds;
    this.#sampleFrameCount += 1;
    this.#sampleVegetationCpuDurationMilliseconds += vegetationCpuDurationMilliseconds;
    if (this.#sampleDurationSeconds < DIAGNOSTIC_UPDATE_INTERVAL_SECONDS) return;

    const { grassRenderer, camera } = this.#debugOptions;
    const {
      renderer,
      vegetationDataset,
      visibleStoredChunkTexture,
    } = grassRenderer;
    renderer.getDrawingBufferSize(this.#drawingBufferSize);
    const submittedCandidateCount = grassRenderer.executedCandidateCount;
    const averageGpuDurationMilliseconds =
      this.#gpuFrameTimer.consumeAverageFrameDurationMilliseconds();
    const testedTileCount = grassRenderer.renderTileDensitySelection.frustumTestedTileCount;
    const visibleTileCount = testedTileCount
      - grassRenderer.renderTileDensitySelection.frustumCulledTileCount;

    this.#diagnosticStatusElement.textContent = [
      `FPS: ${(this.#sampleFrameCount / this.#sampleDurationSeconds).toFixed(1)} · Frame Ø: ${(MILLISECONDS_PER_SECOND * this.#sampleDurationSeconds / this.#sampleFrameCount).toFixed(2)} ms`,
      averageGpuDurationMilliseconds === null
        ? 'GPU-Renderzeit: wird ermittelt …'
        : `GPU-Renderzeit Ø: ${averageGpuDurationMilliseconds.toFixed(2)} ms · GPU-Durchsatz: ${(MILLISECONDS_PER_SECOND / averageGpuDurationMilliseconds).toFixed(0)} Bilder/s (nicht Display-FPS)`,
      `Vegetation CPU Ø: ${(this.#sampleVegetationCpuDurationMilliseconds / this.#sampleFrameCount).toFixed(2)} ms (keine GPU-Zeit)`,
      `Kamera: ${this.#frozenCullingCamera ? 'Beobachter / Culling und LOD eingefroren' : 'Culling folgt Kamera'}`,
      `Position: ${camera.position.toArray().map((coordinate) => coordinate.toFixed(1)).join(' / ')}`,
      `Chunks: ${visibleStoredChunkTexture.visibleStoredChunkCount}/${vegetationDataset.file.header.storedChunkCount} · Tiles: ${grassRenderer.visibleTileCount}`,
      `Tile-Frustum: ${visibleTileCount}/${testedTileCount} maskenaktive Tiles nach Chunk-Culling`,
      `Halme zugelassen: ${grassRenderer.visibleCandidateCount.toLocaleString('de-DE')}`,
      `Instanzen eingereicht: ${submittedCandidateCount.toLocaleString('de-DE')} · Padding: ${submittedCandidateCount - grassRenderer.visibleCandidateCount}`,
      `Buckets (Tiles): ${grassRenderer.renderTileDensitySelection.bucketTileCounts.join(' / ')}`,
      `Buckets (Kapazität): ${grassRenderer.renderTileDensitySelection.bucketCapacities.join(' / ')}`,
      `Cells statisch aktiv: ${grassRenderer.renderTileDensitySelection.activeCellIndices.length}`,
      `Pixel: ${this.#drawingBufferSize.x} × ${this.#drawingBufferSize.y} · DPR: ${renderer.getPixelRatio()}`,
      `AA: ${renderer.getContext().getContextAttributes()?.antialias ? 'an' : 'aus'} · Schatten: ${renderer.shadowMap.enabled ? 'an' : 'aus'} · Vegetation: ${grassRenderer.object3d.visible ? 'an' : 'aus'}`,
      `Letzter Render: ${renderer.info.render.calls} Drawcalls · ${renderer.info.render.triangles} Dreiecke (inkl. Szene/Debug)`,
      'Cell-Maske zeigt statische Zulassung, nicht die Distanz-LOD.',
      'Canvas klicken: Freiflug · Maus: umsehen · Esc: Maus freigeben',
      'Mit gefangener Maus: WASD · Leertaste hoch · Shift runter · C/G/B',
    ].join('\n');
    this.#sampleDurationSeconds = 0;
    this.#sampleFrameCount = 0;
    this.#sampleVegetationCpuDurationMilliseconds = 0;
  }

  /** Starts timing the next renderer.render call when timer queries are supported. */
  beginGpuFrameMeasurement(): void {
    this.#gpuFrameTimer.beginFrameMeasurement();
  }

  /** Completes the timer query started by beginGpuFrameMeasurement. */
  endGpuFrameMeasurement(): void {
    this.#gpuFrameTimer.endFrameMeasurement();
  }

  dispose(): void {
    this.#cameraController.dispose();
    window.removeEventListener('keydown', this.#handleDebugKeyDown);
    this.debugPanelElement.removeEventListener('click', this.#handlePanelClick);
    this.debugPanelElement.remove();
    this.grassChunkCellView.mesh.removeFromParent();
    this.grassChunkCellView.dispose();
    this.storedChunkCullingBoundsOutlines.removeFromParent();
    this.storedChunkCullingBoundsOutlines.geometry.dispose();
    const outlineMaterials = Array.isArray(this.storedChunkCullingBoundsOutlines.material)
      ? this.storedChunkCullingBoundsOutlines.material
      : [this.storedChunkCullingBoundsOutlines.material];
    outlineMaterials.forEach((outlineMaterial) => outlineMaterial.dispose());
    this.cullingFrustumVisualization.group.removeFromParent();
    this.cullingFrustumVisualization.dispose();
    this.#gpuFrameTimer.dispose();
  }

  readonly #handlePanelClick = (event: MouseEvent): void => {
    if (event.target instanceof HTMLButtonElement) {
      this.executeDebugAction(event.target.dataset.action);
    }
  };

  readonly #handleDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || document.pointerLockElement
      !== this.#debugOptions.grassRenderer.renderer.domElement) return;
    const debugAction = KEYBOARD_DEBUG_ACTIONS[event.code];
    if (debugAction) {
      event.preventDefault();
      this.executeDebugAction(debugAction);
    }
  };

  executeDebugAction(debugAction: string | undefined): void {
    const renderControls = this.#debugOptions.renderControls;
    if (debugAction === 'cells') {
      this.grassChunkCellView.mesh.visible = !this.grassChunkCellView.mesh.visible;
    }
    if (debugAction === 'boxes') {
      this.storedChunkCullingBoundsOutlines.visible =
        !this.storedChunkCullingBoundsOutlines.visible;
    }
    if (debugAction === 'freeze') this.toggleCullingFreeze();
    if (debugAction === 'vegetation') {
      this.#debugOptions.grassRenderer.object3d.visible =
        !this.#debugOptions.grassRenderer.object3d.visible;
    }
    if (debugAction === 'aa' && renderControls) {
      renderControls.setAntialias(!renderControls.antialias);
    }
    if (debugAction === 'shadows' && renderControls) {
      renderControls.setShadows(!renderControls.shadows);
    }
    if (debugAction?.startsWith('dpr-') && renderControls) {
      renderControls.setDpr(Number(debugAction.slice('dpr-'.length)));
    }
    this.#refreshActionButtonLabels();
  }

  #refreshActionButtonLabels(): void {
    const renderControls = this.#debugOptions.renderControls;
    const actionLabels: Readonly<Record<string, string>> = {
      vegetation: `Vegetation ${this.#debugOptions.grassRenderer.object3d.visible ? 'an' : 'aus'}`,
      cells: `G: Cells ${this.grassChunkCellView.mesh.visible ? 'an' : 'aus'}`,
      boxes: `B: Boxen ${this.storedChunkCullingBoundsOutlines.visible ? 'an' : 'aus'}`,
      freeze: `C: Culling ${this.#frozenCullingCamera ? 'fortsetzen' : 'einfrieren'}`,
      aa: `AA ${renderControls?.antialias ? 'an' : 'aus'}`,
      shadows: `Schatten ${renderControls?.shadows ? 'an' : 'aus'}`,
      'dpr-0.5': `DPR 0.5${renderControls?.dpr === 0.5 ? ' ✓' : ''}`,
      'dpr-1': `DPR 1${renderControls?.dpr === 1 ? ' ✓' : ''}`,
      'dpr-1.5': `DPR 1.5${renderControls?.dpr === 1.5 ? ' ✓' : ''}`,
      'dpr-2': `DPR 2${renderControls?.dpr === 2 ? ' ✓' : ''}`,
    };
    this.#actionButtons.forEach((actionButton) => {
      actionButton.textContent = actionLabels[actionButton.dataset.action!]!;
    });
  }
}
