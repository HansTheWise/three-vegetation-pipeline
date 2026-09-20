const VALUES_PER_TILE_RECORD = 4;
const VALUES_PER_EXACT_CANDIDATE_RECORD = 2;
const BYTES_PER_UNSIGNED_INTEGER = Uint32Array.BYTES_PER_ELEMENT;

export type RenderTileSubmissionWorkload = Readonly<{
  name: string;
  tileCapacity: number;
  visibleTileRecords: Uint32Array;
  maximumCandidatesPerTile: number;
}>;

export type RenderTileSubmissionMetrics = Readonly<{
  strategy: string;
  visibleTileCount: number;
  visibleCandidateCount: number;
  submittedCandidateCount: number;
  redundantCandidateCount: number;
  redundantCandidatePercentage: number;
  drawGroupCount: number;
  minimumUploadBytes: number;
  currentTileTextureBytes: number;
  checksum: number;
}>;

/**
 * Models the current renderer: visible Tiles are reordered into capacity
 * buckets, and each Tile submits the full capacity of its assigned bucket.
 */
export class CapacityBucketSubmissionPlanner {
  readonly #strategy: string;
  readonly #bucketCapacities: Uint32Array;
  readonly #bucketTileCounts: Uint32Array;
  readonly #bucketRecordOffsets: Uint32Array;
  readonly #bucketWriteOffsets: Uint32Array;
  readonly #pendingBucketIndices: Uint16Array;
  readonly #orderedTileRecords: Uint32Array;

  constructor(
    strategy: string,
    bucketCapacities: Uint32Array,
    visibleTileCapacity: number,
  ) {
    this.#strategy = strategy;
    this.#bucketCapacities = bucketCapacities;
    this.#bucketTileCounts = new Uint32Array(bucketCapacities.length);
    this.#bucketRecordOffsets = new Uint32Array(bucketCapacities.length);
    this.#bucketWriteOffsets = new Uint32Array(bucketCapacities.length);
    this.#pendingBucketIndices = new Uint16Array(visibleTileCapacity);
    this.#orderedTileRecords = new Uint32Array(
      visibleTileCapacity * VALUES_PER_TILE_RECORD,
    );
  }

  plan(workload: RenderTileSubmissionWorkload): RenderTileSubmissionMetrics {
    const visibleTileCount = workload.visibleTileRecords.length / VALUES_PER_TILE_RECORD;
    this.#bucketTileCounts.fill(0);
    let visibleCandidateCount = 0;

    for (let tileIndex = 0; tileIndex < visibleTileCount; tileIndex += 1) {
      const activeCandidateCount = workload.visibleTileRecords[
        tileIndex * VALUES_PER_TILE_RECORD + 3
      ]!;
      const bucketIndex = findCapacityBucketIndex(
        this.#bucketCapacities,
        activeCandidateCount,
      );
      this.#pendingBucketIndices[tileIndex] = bucketIndex;
      this.#bucketTileCounts[bucketIndex] = this.#bucketTileCounts[bucketIndex]! + 1;
      visibleCandidateCount += activeCandidateCount;
    }

    let nextRecordOffset = 0;
    let submittedCandidateCount = 0;
    let drawGroupCount = 0;
    for (let bucketIndex = 0; bucketIndex < this.#bucketCapacities.length; bucketIndex += 1) {
      const bucketTileCount = this.#bucketTileCounts[bucketIndex]!;
      this.#bucketRecordOffsets[bucketIndex] = nextRecordOffset;
      this.#bucketWriteOffsets[bucketIndex] = nextRecordOffset;
      nextRecordOffset += bucketTileCount;
      if (bucketTileCount === 0) continue;
      drawGroupCount += 1;
      submittedCandidateCount += bucketTileCount * this.#bucketCapacities[bucketIndex]!;
    }

    for (let tileIndex = 0; tileIndex < visibleTileCount; tileIndex += 1) {
      const bucketIndex = this.#pendingBucketIndices[tileIndex]!;
      const targetRecordIndex = this.#bucketWriteOffsets[bucketIndex]!;
      this.#bucketWriteOffsets[bucketIndex] = targetRecordIndex + 1;
      const sourceOffset = tileIndex * VALUES_PER_TILE_RECORD;
      const targetOffset = targetRecordIndex * VALUES_PER_TILE_RECORD;
      for (let valueIndex = 0; valueIndex < VALUES_PER_TILE_RECORD; valueIndex += 1) {
        this.#orderedTileRecords[targetOffset + valueIndex] =
          workload.visibleTileRecords[sourceOffset + valueIndex]!;
      }
    }

    const redundantCandidateCount = submittedCandidateCount - visibleCandidateCount;
    return {
      strategy: this.#strategy,
      visibleTileCount,
      visibleCandidateCount,
      submittedCandidateCount,
      redundantCandidateCount,
      redundantCandidatePercentage: submittedCandidateCount === 0
        ? 0
        : redundantCandidateCount / submittedCandidateCount * 100,
      drawGroupCount,
      minimumUploadBytes: visibleTileCount
        * VALUES_PER_TILE_RECORD
        * BYTES_PER_UNSIGNED_INTEGER,
      currentTileTextureBytes: workload.tileCapacity
        * VALUES_PER_TILE_RECORD
        * BYTES_PER_UNSIGNED_INTEGER,
      checksum: calculateChecksum(
        this.#orderedTileRecords,
        visibleTileCount * VALUES_PER_TILE_RECORD,
      ),
    };
  }
}

/**
 * Models a single exact draw backed by an explicit mapping from every
 * submitted candidate to its Tile and Tile-local candidate index.
 */
export class ExactCandidateSubmissionPlanner {
  readonly #visibleTileRecords: Uint32Array;
  readonly #candidateRecords: Uint32Array;

  constructor(visibleTileCapacity: number, maximumVisibleCandidateCount: number) {
    this.#visibleTileRecords = new Uint32Array(
      visibleTileCapacity * VALUES_PER_TILE_RECORD,
    );
    this.#candidateRecords = new Uint32Array(
      maximumVisibleCandidateCount * VALUES_PER_EXACT_CANDIDATE_RECORD,
    );
  }

  plan(workload: RenderTileSubmissionWorkload): RenderTileSubmissionMetrics {
    const visibleTileCount = workload.visibleTileRecords.length / VALUES_PER_TILE_RECORD;
    this.#visibleTileRecords.set(workload.visibleTileRecords);
    let visibleCandidateCount = 0;

    for (let tileIndex = 0; tileIndex < visibleTileCount; tileIndex += 1) {
      const activeCandidateCount = workload.visibleTileRecords[
        tileIndex * VALUES_PER_TILE_RECORD + 3
      ]!;
      for (let candidateIndex = 0; candidateIndex < activeCandidateCount; candidateIndex += 1) {
        const candidateRecordOffset = visibleCandidateCount
          * VALUES_PER_EXACT_CANDIDATE_RECORD;
        this.#candidateRecords[candidateRecordOffset] = tileIndex;
        this.#candidateRecords[candidateRecordOffset + 1] = candidateIndex;
        visibleCandidateCount += 1;
      }
    }

    const visibleTileBytes = visibleTileCount
      * VALUES_PER_TILE_RECORD
      * BYTES_PER_UNSIGNED_INTEGER;
    const candidateRecordBytes = visibleCandidateCount
      * VALUES_PER_EXACT_CANDIDATE_RECORD
      * BYTES_PER_UNSIGNED_INTEGER;
    return {
      strategy: 'Exact CPU candidate compaction',
      visibleTileCount,
      visibleCandidateCount,
      submittedCandidateCount: visibleCandidateCount,
      redundantCandidateCount: 0,
      redundantCandidatePercentage: 0,
      drawGroupCount: visibleCandidateCount === 0 ? 0 : 1,
      minimumUploadBytes: visibleTileBytes + candidateRecordBytes,
      currentTileTextureBytes: workload.tileCapacity
        * VALUES_PER_TILE_RECORD
        * BYTES_PER_UNSIGNED_INTEGER,
      checksum: calculateChecksum(
        this.#candidateRecords,
        visibleCandidateCount * VALUES_PER_EXACT_CANDIDATE_RECORD,
      ),
    };
  }
}

export function createPowerOfTwoCapacities(maximumCandidateCount: number): Uint32Array {
  const capacities: number[] = [];
  for (let capacity = 1; capacity < maximumCandidateCount; capacity *= 2) {
    capacities.push(capacity);
  }
  capacities.push(maximumCandidateCount <= 1
    ? 1
    : 2 ** Math.ceil(Math.log2(maximumCandidateCount)));
  return Uint32Array.from(capacities);
}

export function createQuarterStepCapacities(maximumCandidateCount: number): Uint32Array {
  const capacities = [1];
  while (capacities[capacities.length - 1]! < maximumCandidateCount) {
    const previousCapacity = capacities[capacities.length - 1]!;
    const nextCapacity = Math.min(
      maximumCandidateCount,
      Math.max(previousCapacity + 1, Math.ceil(previousCapacity * 1.25)),
    );
    capacities.push(nextCapacity);
  }
  return Uint32Array.from(capacities);
}

export function createDeterministicWorkload(options: Readonly<{
  name: string;
  tileCapacity: number;
  visibleTileCount: number;
  maximumCandidatesPerTile: number;
  seed: number;
}>): RenderTileSubmissionWorkload {
  const visibleTileRecords = new Uint32Array(
    options.visibleTileCount * VALUES_PER_TILE_RECORD,
  );
  let randomState = options.seed >>> 0;
  for (let tileIndex = 0; tileIndex < options.visibleTileCount; tileIndex += 1) {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    const normalizedDistance = randomState / 0xffff_ffff;
    const densityRatio = (1 - normalizedDistance) ** 2;
    const recordOffset = tileIndex * VALUES_PER_TILE_RECORD;
    visibleTileRecords[recordOffset] = tileIndex % options.tileCapacity;
    visibleTileRecords[recordOffset + 1] = tileIndex * 17;
    visibleTileRecords[recordOffset + 2] = 1;
    visibleTileRecords[recordOffset + 3] = Math.max(
      1,
      Math.round(options.maximumCandidatesPerTile * densityRatio),
    );
  }
  return {
    name: options.name,
    tileCapacity: options.tileCapacity,
    visibleTileRecords,
    maximumCandidatesPerTile: options.maximumCandidatesPerTile,
  };
}

export function countVisibleCandidates(workload: RenderTileSubmissionWorkload): number {
  let count = 0;
  for (
    let recordOffset = 0;
    recordOffset < workload.visibleTileRecords.length;
    recordOffset += VALUES_PER_TILE_RECORD
  ) {
    count += workload.visibleTileRecords[recordOffset + 3]!;
  }
  return count;
}

function findCapacityBucketIndex(capacities: Uint32Array, candidateCount: number): number {
  let minimumIndex = 0;
  let maximumIndex = capacities.length - 1;
  while (minimumIndex < maximumIndex) {
    const middleIndex = Math.floor((minimumIndex + maximumIndex) / 2);
    if (capacities[middleIndex]! < candidateCount) minimumIndex = middleIndex + 1;
    else maximumIndex = middleIndex;
  }
  return minimumIndex;
}

function calculateChecksum(values: Uint32Array, valueCount: number): number {
  if (valueCount === 0) return 0;
  const middleIndex = Math.floor(valueCount / 2);
  return (values[0]! ^ values[middleIndex]! ^ values[valueCount - 1]!) >>> 0;
}
