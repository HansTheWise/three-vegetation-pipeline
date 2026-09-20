# Render Tile Submission Benchmarks

Run the isolated comparison with:

```bash
npm run benchmark
```

The benchmark receives already computed visible Render Tile records. It compares
only the per-frame work required to turn those records into WebGL submissions:

- **Current power-of-two buckets:** matches the current capacity grouping.
- **25% capacity-step buckets:** reduces padding through more draw groups.
- **Exact CPU candidate compaction:** writes an explicit
  `{ tileIndex, candidateIndex }` record for every visible candidate and submits
  one exact draw.

Two deterministic workloads represent `0.25 m` Cells with `4 m` and `8 m`
Render Tiles. The benchmark reports CPU throughput separately from structural
metrics such as draw groups, submitted candidates, padding and minimum upload
payload.

`minimumUpload` is the smallest logical payload required by the modeled
strategy. `currentTileTexture` is the allocated RGBA32UI Tile texture footprint
of the current renderer. The benchmark does not execute WebGL and therefore
does not claim GPU timings or driver transfer behavior.

Run the browser integration benchmark with:

```bash
npm run benchmark:webgl
```

It renders the real Grass material and data path at a fixed `1280 x 720`
resolution. After warm-up, it compares the current power-of-two buckets with
25% capacity-step buckets. `EXT_disjoint_timer_query_webgl2` supplies GPU time
when the browser and GPU expose it; unsupported or disjoint measurements are
reported as unavailable instead of falling back to CPU frame time.
