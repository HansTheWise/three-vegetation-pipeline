import { bench, describe } from 'vitest';

import {
  CapacityBucketSubmissionPlanner,
  countVisibleCandidates,
  createDeterministicWorkload,
  createPowerOfTwoCapacities,
  createQuarterStepCapacities,
  ExactCandidateSubmissionPlanner,
  type RenderTileSubmissionMetrics,
  type RenderTileSubmissionWorkload,
} from './render-tile-submission-strategies.js';

const workloads = [
  createDeterministicWorkload({
    name: '4 m Render Tiles (16 x 16 Cells)',
    tileCapacity: 16_384,
    visibleTileCount: 2_048,
    maximumCandidatesPerTile: 1_024,
    seed: 0x4c11_db7,
  }),
  createDeterministicWorkload({
    name: '8 m Render Tiles (32 x 32 Cells)',
    tileCapacity: 4_096,
    visibleTileCount: 512,
    maximumCandidatesPerTile: 4_096,
    seed: 0x8c11_db7,
  }),
] as const;

let submissionBenchmarkChecksum = 0;

for (const workload of workloads) {
  const maximumVisibleCandidateCount = countVisibleCandidates(workload);
  const powerOfTwoPlanner = new CapacityBucketSubmissionPlanner(
    'Current power-of-two buckets',
    createPowerOfTwoCapacities(workload.maximumCandidatesPerTile),
    getVisibleTileCount(workload),
  );
  const quarterStepPlanner = new CapacityBucketSubmissionPlanner(
    '25% capacity-step buckets',
    createQuarterStepCapacities(workload.maximumCandidatesPerTile),
    getVisibleTileCount(workload),
  );
  const exactPlanner = new ExactCandidateSubmissionPlanner(
    getVisibleTileCount(workload),
    maximumVisibleCandidateCount,
  );
  const metrics = [
    powerOfTwoPlanner.plan(workload),
    quarterStepPlanner.plan(workload),
    exactPlanner.plan(workload),
  ];
  verifyEquivalentCandidateCounts(metrics, maximumVisibleCandidateCount);

  describe(
    `${workload.name} | ${maximumVisibleCandidateCount.toLocaleString('en-US')} visible candidates`,
    () => {
      bench(formatMetrics(metrics[0]!), () => {
        submissionBenchmarkChecksum ^= powerOfTwoPlanner.plan(workload).checksum;
      });
      bench(formatMetrics(metrics[1]!), () => {
        submissionBenchmarkChecksum ^= quarterStepPlanner.plan(workload).checksum;
      });
      bench(formatMetrics(metrics[2]!), () => {
        submissionBenchmarkChecksum ^= exactPlanner.plan(workload).checksum;
      });
    },
  );
}

function getVisibleTileCount(workload: RenderTileSubmissionWorkload): number {
  return workload.visibleTileRecords.length / 4;
}

function verifyEquivalentCandidateCounts(
  metrics: readonly RenderTileSubmissionMetrics[],
  expectedCandidateCount: number,
): void {
  for (const result of metrics) {
    if (result.visibleCandidateCount !== expectedCandidateCount) {
      throw new Error(
        `${result.strategy} produced ${result.visibleCandidateCount} visible candidates; `
        + `expected ${expectedCandidateCount}.`,
      );
    }
    if (result.submittedCandidateCount < result.visibleCandidateCount) {
      throw new Error(`${result.strategy} dropped visible candidates.`);
    }
  }
}

function formatMetrics(metrics: RenderTileSubmissionMetrics) {
  return `${metrics.strategy} | ${metrics.drawGroupCount} draws | `
    + `${metrics.submittedCandidateCount.toLocaleString('en-US')} submitted | `
    + `${metrics.redundantCandidatePercentage.toFixed(1)}% padding | `
    + `${formatBytes(metrics.minimumUploadBytes)} minimum upload | `
    + `${formatBytes(metrics.currentTileTextureBytes)} current Tile texture`;
}

function formatBytes(byteCount: number): string {
  if (byteCount < 1_024) return `${byteCount} B`;
  if (byteCount < 1_024 ** 2) return `${(byteCount / 1_024).toFixed(1)} KiB`;
  return `${(byteCount / 1_024 ** 2).toFixed(1)} MiB`;
}
