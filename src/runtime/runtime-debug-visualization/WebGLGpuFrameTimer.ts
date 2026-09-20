const MAXIMUM_PENDING_GPU_QUERIES = 8;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

type DisjointTimerQueryExtension = Readonly<{
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}>;

/** Measures asynchronous GPU frame time without blocking the render loop. */
export class WebGLGpuFrameTimer {
  readonly #webgl2Context: WebGL2RenderingContext | null;
  readonly #timerQueryExtension: DisjointTimerQueryExtension | null;
  readonly #pendingQueries: WebGLQuery[] = [];
  #activeQuery: WebGLQuery | null = null;
  #completedFrameDurationMilliseconds = 0;
  #completedFrameCount = 0;

  constructor(context: WebGLRenderingContext | WebGL2RenderingContext) {
    this.#webgl2Context = 'createQuery' in context
      ? context as WebGL2RenderingContext
      : null;
    this.#timerQueryExtension = this.#webgl2Context
      ?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
  }

  beginFrameMeasurement(): void {
    this.#collectCompletedQueries();
    if (!this.#webgl2Context || !this.#timerQueryExtension || this.#activeQuery
      || this.#pendingQueries.length >= MAXIMUM_PENDING_GPU_QUERIES) return;

    const query = this.#webgl2Context.createQuery();
    if (!query) return;
    this.#webgl2Context.beginQuery(this.#timerQueryExtension.TIME_ELAPSED_EXT, query);
    this.#activeQuery = query;
  }

  endFrameMeasurement(): void {
    if (!this.#webgl2Context || !this.#timerQueryExtension || !this.#activeQuery) return;
    this.#webgl2Context.endQuery(this.#timerQueryExtension.TIME_ELAPSED_EXT);
    this.#pendingQueries.push(this.#activeQuery);
    this.#activeQuery = null;
  }

  consumeAverageFrameDurationMilliseconds(): number | null {
    this.#collectCompletedQueries();
    const averageDuration = this.#completedFrameCount > 0
      ? this.#completedFrameDurationMilliseconds / this.#completedFrameCount
      : null;
    this.#completedFrameDurationMilliseconds = 0;
    this.#completedFrameCount = 0;
    return averageDuration;
  }

  dispose(): void {
    if (this.#webgl2Context) {
      if (this.#activeQuery) this.#webgl2Context.deleteQuery(this.#activeQuery);
      this.#pendingQueries.forEach((query) => this.#webgl2Context!.deleteQuery(query));
    }
    this.#activeQuery = null;
    this.#pendingQueries.length = 0;
    this.#completedFrameDurationMilliseconds = 0;
    this.#completedFrameCount = 0;
  }

  #collectCompletedQueries(): void {
    const context = this.#webgl2Context;
    const timerQueryExtension = this.#timerQueryExtension;
    if (!context || !timerQueryExtension) return;

    const gpuTimingIsInvalid = context.getParameter(
      timerQueryExtension.GPU_DISJOINT_EXT,
    ) as boolean;
    for (let queryIndex = this.#pendingQueries.length - 1; queryIndex >= 0; queryIndex -= 1) {
      const query = this.#pendingQueries[queryIndex]!;
      if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) continue;
      if (!gpuTimingIsInvalid) {
        const durationNanoseconds = Number(context.getQueryParameter(
          query,
          context.QUERY_RESULT,
        ));
        this.#completedFrameDurationMilliseconds +=
          durationNanoseconds / NANOSECONDS_PER_MILLISECOND;
        this.#completedFrameCount += 1;
      }
      context.deleteQuery(query);
      this.#pendingQueries.splice(queryIndex, 1);
    }
  }
}
