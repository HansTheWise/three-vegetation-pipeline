import { PerspectiveCamera, Vector2, Vector3, type Object3D } from 'three';

import { createRuntimeChunkBoundingBoxes } from '../chunking/ChunkBoundingBoxes.js';
import type { WebGLVegetationAdapter } from '../gpu/webgl/WebGLVegetationAdapter.js';
import { WebGLDebugChunkView } from '../rendering/webgl/WebGLDebugChunkView.js';
import type { WebGLGrassView } from '../rendering/webgl/WebGLGrassView.js';
import { CameraFrustumVisualization } from './CameraFrustumVisualization.js';
import { createChunkBoundingBoxOutlines } from './createChunkBoundingBoxOutlines.js';
import { FirstPersonCameraController } from './FirstPersonCameraController.js';

export type WebGLVegetationDebugRenderControls = Readonly<{
  antialias: boolean;
  shadows: boolean;
  dpr: number;
  setAntialias(enabled: boolean): void;
  setShadows(enabled: boolean): void;
  setDpr(dpr: number): void;
}>;

export type WebGLVegetationDebugOptions = Readonly<{
  adapter: WebGLVegetationAdapter;
  grass: WebGLGrassView;
  camera: PerspectiveCamera;
  /** World-space parent, outside any transformed model group. */
  scene: Object3D;
  panelParent: HTMLElement;
  /** Reserve space for a host application's persistent header. */
  panelTopOffsetPx?: number;
  renderControls?: WebGLVegetationDebugRenderControls;
}>;

/** Shared debug controls; does not own the renderer, grass, adapter or render loop. */
export class WebGLVegetationDebug {
  readonly cells: WebGLDebugChunkView;
  readonly boxes: ReturnType<typeof createChunkBoundingBoxOutlines>;
  readonly frustum = new CameraFrustumVisualization();
  readonly panel: HTMLDivElement;
  readonly #status: HTMLPreElement;
  readonly #controller: FirstPersonCameraController;
  readonly #options: WebGLVegetationDebugOptions;
  readonly #buttons: HTMLButtonElement[] = [];
  readonly #drawingBuffer = new Vector2();
  readonly #gpuContext: WebGL2RenderingContext | null;
  readonly #gpuTimer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  readonly #pendingGpuQueries: WebGLQuery[] = [];
  #activeGpuQuery: WebGLQuery | null = null;
  #frozenCamera: PerspectiveCamera | null = null;
  #sampleSeconds = 0;
  #sampleFrames = 0;
  #sampleCpuMs = 0;
  #sampleGpuMs = 0;
  #sampleGpuFrames = 0;

  constructor(options: WebGLVegetationDebugOptions) {
    this.#options = options;
    const { adapter, grass, camera, scene, panelParent } = options;
    const context = adapter.renderer.getContext();
    this.#gpuContext = 'createQuery' in context
      ? context as WebGL2RenderingContext
      : null;
    this.#gpuTimer = this.#gpuContext?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
    this.cells = new WebGLDebugChunkView(adapter, grass.resources);
    this.cells.mesh.visible = false;
    this.boxes = createChunkBoundingBoxOutlines(createRuntimeChunkBoundingBoxes(adapter.dataset));
    this.boxes.visible = false;
    grass.mesh.add(this.cells.mesh, this.boxes);
    scene.add(this.frustum.group);
    for (const root of [this.cells.mesh, this.boxes, this.frustum.group]) {
      root.traverse((object) => { object.raycast = () => undefined; });
    }
    grass.mesh.updateWorldMatrix(true, false);
    const axes = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
    const { coordinateSystem, grid } = adapter.dataset.file.header;
    this.#controller = new FirstPersonCameraController({
      camera,
      canvas: adapter.renderer.domElement,
      upAxis: axes[coordinateSystem.upAxis].clone().transformDirection(grass.mesh.matrixWorld),
      horizontalForwardAxis: axes[coordinateSystem.horizontalAxes[1]].clone()
        .transformDirection(grass.mesh.matrixWorld),
      movementSpeed: grid.chunkSize * 1.5 * grass.mesh.getWorldScale(new Vector3()).length() / Math.sqrt(3),
    });
    this.panel = document.createElement('div');
    this.panel.dataset.vegetationDebug = 'true';
    const panelTop = options.panelTopOffsetPx ?? 8;
    this.panel.style.cssText = `position:absolute;right:8px;top:${panelTop}px;z-index:20;max-width:calc(100% - 16px);max-height:calc(100% - ${panelTop + 8}px);overflow:auto;padding:10px;background:#101827e8;color:#fff;font:12px monospace;pointer-events:auto`;
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    const actionsToShow = ['vegetation', 'cells', 'boxes', 'freeze'];
    if (options.renderControls) actionsToShow.push('aa', 'shadows', 'dpr-0.5', 'dpr-1', 'dpr-1.5', 'dpr-2');
    for (const action of actionsToShow) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action;
      button.style.cssText = 'padding:4px 6px;background:#243448;color:white;border:1px solid #718096;border-radius:3px;cursor:pointer';
      this.#buttons.push(button);
      actions.append(button);
    }
    this.#status = document.createElement('pre');
    this.#status.style.cssText = 'margin:8px 0 0;white-space:pre-wrap';
    this.panel.append(actions, this.#status);
    this.panel.addEventListener('click', this.#click);
    window.addEventListener('keydown', this.#keyDown);
    panelParent.append(this.panel);
    this.#refreshButtons();
  }

  get cullingCamera(): PerspectiveCamera {
    return this.#frozenCamera ?? this.#options.camera;
  }

  toggleCullingFreeze(): void {
    this.#options.camera.updateMatrixWorld();
    this.#frozenCamera = this.#frozenCamera ? null : this.#options.camera.clone();
    this.frustum.group.visible = this.#frozenCamera !== null;
    if (this.#frozenCamera) this.frustum.update(this.#frozenCamera);
    this.#refreshButtons();
  }

  /** Call before the existing frustum and density update; render with the original camera. */
  update(deltaSeconds: number): void {
    this.#controller.update(Math.min(deltaSeconds, 0.1));
    this.#options.camera.updateMatrixWorld();
  }

  /** CPU time covers only the caller's culling/density work, not GPU execution. */
  recordFrame(deltaSeconds: number, vegetationCpuMs: number): void {
    this.#sampleSeconds += deltaSeconds;
    this.#sampleFrames += 1;
    this.#sampleCpuMs += vegetationCpuMs;
    if (this.#sampleSeconds < 0.5) return;
    const { adapter, grass, camera } = this.#options;
    const { renderer, dataset } = adapter;
    const layer = dataset.enabledLayers.find((entry) => entry.layerId === grass.layerId)!;
    renderer.getDrawingBufferSize(this.#drawingBuffer);
    const submitted = grass.executedCandidateCount;
    const gpuAverageMs = this.#sampleGpuFrames > 0
      ? this.#sampleGpuMs / this.#sampleGpuFrames
      : null;
    this.#status.textContent = [
      `FPS: ${(this.#sampleFrames / this.#sampleSeconds).toFixed(1)} · Frame Ø: ${(1000 * this.#sampleSeconds / this.#sampleFrames).toFixed(2)} ms`,
      gpuAverageMs === null
        ? 'GPU-Renderzeit: wird ermittelt …'
        : `GPU-Renderzeit Ø: ${gpuAverageMs.toFixed(2)} ms · GPU-Durchsatz: ${(1000 / gpuAverageMs).toFixed(0)} Bilder/s (nicht Display-FPS)`,
      `Vegetation CPU Ø: ${(this.#sampleCpuMs / this.#sampleFrames).toFixed(2)} ms (keine GPU-Zeit)`,
      `Kamera: ${this.#frozenCamera ? 'Beobachter / Culling und LOD eingefroren' : 'Culling folgt Kamera'}`,
      `Position: ${camera.position.toArray().map((value) => value.toFixed(1)).join(' / ')}`,
      `Chunks: ${adapter.visibleChunkBuffer.visibleChunkCount}/${dataset.file.header.storedChunkCount} · Tiles: ${grass.visibleTileCount}`,
      `Tile-Frustum: ${grass.tileDensity.frustumTestedTileCount - grass.tileDensity.frustumCulledTileCount}/${grass.tileDensity.frustumTestedTileCount} maskenaktive Tiles nach Chunk-Culling`,
      `Halme zugelassen: ${grass.visibleCandidateCount.toLocaleString('de-DE')}`,
      `Instanzen eingereicht: ${submitted.toLocaleString('de-DE')} · Padding: ${submitted - grass.visibleCandidateCount}`,
      `Buckets (Tiles): ${grass.tileDensity.bucketTileCounts.join(' / ')}`,
      `Buckets (Kapazität): ${grass.tileDensity.bucketCapacities.join(' / ')}`,
      `Cells statisch aktiv: ${grass.tileDensity.activeCellIndices.length}`,
      `Pixel: ${this.#drawingBuffer.x} × ${this.#drawingBuffer.y} · DPR: ${renderer.getPixelRatio()}`,
      `AA: ${renderer.getContext().getContextAttributes()?.antialias ? 'an' : 'aus'} · Schatten: ${renderer.shadowMap.enabled ? 'an' : 'aus'} · Vegetation: ${grass.mesh.visible ? 'an' : 'aus'}`,
      `Letzter Render: ${renderer.info.render.calls} Drawcalls · ${renderer.info.render.triangles} Dreiecke (inkl. Szene/Debug)`,
      'Cell-Maske zeigt statische Zulassung, nicht die Distanz-LOD.',
      'Canvas klicken: Freiflug · Maus: umsehen · Esc: Maus freigeben',
      'Mit gefangener Maus: WASD · Leertaste hoch · Shift runter · C/G/B',
    ].join('\n');
    this.#sampleSeconds = 0;
    this.#sampleFrames = 0;
    this.#sampleCpuMs = 0;
    this.#sampleGpuMs = 0;
    this.#sampleGpuFrames = 0;
  }

  /** Wrap exactly one renderer.render call to measure GPU work without the display refresh cap. */
  beginGpuFrame(): void {
    this.#collectGpuQueries();
    if (!this.#gpuContext || !this.#gpuTimer || this.#activeGpuQuery
      || this.#pendingGpuQueries.length >= 8) return;
    const query = this.#gpuContext.createQuery();
    if (!query) return;
    this.#gpuContext.beginQuery(this.#gpuTimer.TIME_ELAPSED_EXT, query);
    this.#activeGpuQuery = query;
  }

  /** Completes the GPU query started by beginGpuFrame. */
  endGpuFrame(): void {
    if (!this.#gpuContext || !this.#gpuTimer || !this.#activeGpuQuery) return;
    this.#gpuContext.endQuery(this.#gpuTimer.TIME_ELAPSED_EXT);
    this.#pendingGpuQueries.push(this.#activeGpuQuery);
    this.#activeGpuQuery = null;
  }

  dispose(): void {
    this.#controller.dispose();
    window.removeEventListener('keydown', this.#keyDown);
    this.panel.removeEventListener('click', this.#click);
    this.panel.remove();
    this.cells.mesh.removeFromParent();
    this.cells.dispose();
    this.boxes.removeFromParent();
    this.boxes.geometry.dispose();
    const materials = Array.isArray(this.boxes.material) ? this.boxes.material : [this.boxes.material];
    materials.forEach((material) => material.dispose());
    this.frustum.group.removeFromParent();
    this.frustum.dispose();
    if (this.#gpuContext) {
      if (this.#activeGpuQuery) this.#gpuContext.deleteQuery(this.#activeGpuQuery);
      this.#pendingGpuQueries.forEach((query) => this.#gpuContext!.deleteQuery(query));
    }
    this.#activeGpuQuery = null;
    this.#pendingGpuQueries.length = 0;
  }

  #collectGpuQueries(): void {
    const context = this.#gpuContext;
    const timer = this.#gpuTimer;
    if (!context || !timer) return;
    const disjoint = context.getParameter(timer.GPU_DISJOINT_EXT) as boolean;
    for (let index = this.#pendingGpuQueries.length - 1; index >= 0; index -= 1) {
      const query = this.#pendingGpuQueries[index]!;
      if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) continue;
      if (!disjoint) {
        this.#sampleGpuMs += Number(context.getQueryParameter(query, context.QUERY_RESULT)) / 1_000_000;
        this.#sampleGpuFrames += 1;
      }
      context.deleteQuery(query);
      this.#pendingGpuQueries.splice(index, 1);
    }
  }

  readonly #click = (event: MouseEvent): void => {
    if (event.target instanceof HTMLButtonElement) this.act(event.target.dataset.action);
  };

  readonly #keyDown = (event: KeyboardEvent): void => {
    if (event.repeat || document.pointerLockElement !== this.#options.adapter.renderer.domElement) return;
    const action = { KeyG: 'cells', KeyB: 'boxes', KeyC: 'freeze' }[event.code];
    if (action) { event.preventDefault(); this.act(action); }
  };

  act(action: string | undefined): void {
    const controls = this.#options.renderControls;
    if (action === 'cells') this.cells.mesh.visible = !this.cells.mesh.visible;
    if (action === 'boxes') this.boxes.visible = !this.boxes.visible;
    if (action === 'freeze') this.toggleCullingFreeze();
    if (action === 'vegetation') this.#options.grass.mesh.visible = !this.#options.grass.mesh.visible;
    if (action === 'aa' && controls) controls.setAntialias(!controls.antialias);
    if (action === 'shadows' && controls) controls.setShadows(!controls.shadows);
    if (action?.startsWith('dpr-') && controls) controls.setDpr(Number(action.slice(4)));
    this.#refreshButtons();
  }

  #refreshButtons(): void {
    const controls = this.#options.renderControls;
    const labels: Record<string, string> = {
      vegetation: `Vegetation ${this.#options.grass.mesh.visible ? 'an' : 'aus'}`,
      cells: `G: Cells ${this.cells.mesh.visible ? 'an' : 'aus'}`,
      boxes: `B: Boxen ${this.boxes.visible ? 'an' : 'aus'}`,
      freeze: `C: Culling ${this.#frozenCamera ? 'fortsetzen' : 'einfrieren'}`,
      aa: `AA ${controls?.antialias ? 'an' : 'aus'}`,
      shadows: `Schatten ${controls?.shadows ? 'an' : 'aus'}`,
      'dpr-0.5': `DPR 0.5${controls?.dpr === 0.5 ? ' ✓' : ''}`,
      'dpr-1': `DPR 1${controls?.dpr === 1 ? ' ✓' : ''}`,
      'dpr-1.5': `DPR 1.5${controls?.dpr === 1.5 ? ' ✓' : ''}`,
      'dpr-2': `DPR 2${controls?.dpr === 2 ? ' ✓' : ''}`,
    };
    this.#buttons.forEach((button) => { button.textContent = labels[button.dataset.action!]!; });
  }
}
