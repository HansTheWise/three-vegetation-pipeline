import type { VegetationLayerExtractionConfig } from '../../configuration/VegetationCompilerConfig.js';
import {
  calculateTriangleHorizontalBounds,
  triangleOverlapsHorizontalRectangle,
  type ExtractionTriangle,
} from '../model-triangle-selection/ExtractionGeometry.js';

export function rasterizeVegetationMask(
  vegetationTriangles: readonly ExtractionTriangle[],
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  maskResolutionPerChunkAxis: number,
): Uint8Array {
  const mask = new Uint8Array(maskResolutionPerChunkAxis ** 2);
  const cellSize = chunkSize / maskResolutionPerChunkAxis;
  for (const triangle of vegetationTriangles) {
    const triangleBounds = calculateTriangleHorizontalBounds(triangle);
    const minimumCellX = clamp(
      Math.floor((triangleBounds.minimumX - chunkOriginX) / cellSize),
      0,
      maskResolutionPerChunkAxis - 1,
    );
    const maximumCellX = clamp(
      Math.ceil((triangleBounds.maximumX - chunkOriginX) / cellSize) - 1,
      0,
      maskResolutionPerChunkAxis - 1,
    );
    const minimumCellY = clamp(
      Math.floor((triangleBounds.minimumY - chunkOriginY) / cellSize),
      0,
      maskResolutionPerChunkAxis - 1,
    );
    const maximumCellY = clamp(
      Math.ceil((triangleBounds.maximumY - chunkOriginY) / cellSize) - 1,
      0,
      maskResolutionPerChunkAxis - 1,
    );
    for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        const cellMinimumX = chunkOriginX + cellX * cellSize;
        const cellMinimumY = chunkOriginY + cellY * cellSize;
        if (!triangleOverlapsHorizontalRectangle(
          triangle,
          cellMinimumX,
          cellMinimumY,
          cellMinimumX + cellSize,
          cellMinimumY + cellSize,
        )) {
          continue;
        }
        mask[cellY * maskResolutionPerChunkAxis + cellX] = 1;
      }
    }
  }
  return mask;
}

export function removeExcludedCellsFromMask(
  vegetationMask: Uint8Array,
  exclusionTriangles: readonly ExtractionTriangle[],
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  maskResolutionPerChunkAxis: number,
): void {
  if (exclusionTriangles.length === 0) return;
  const exclusionMask = rasterizeVegetationMask(
    exclusionTriangles,
    chunkOriginX,
    chunkOriginY,
    chunkSize,
    maskResolutionPerChunkAxis,
  );
  for (let cellIndex = 0; cellIndex < vegetationMask.length; cellIndex += 1) {
    if (exclusionMask[cellIndex] === 1) vegetationMask[cellIndex] = 0;
  }
}

export function assertLayerMasksDoNotOverlap(
  layerMasks: readonly Uint8Array[],
  layers: readonly VegetationLayerExtractionConfig[],
  allowVegetationLayerOverlap: boolean,
  chunkGridX: number,
  chunkGridY: number,
): void {
  if (allowVegetationLayerOverlap) return;
  for (let firstLayerIndex = 0; firstLayerIndex < layerMasks.length; firstLayerIndex += 1) {
    for (
      let secondLayerIndex = firstLayerIndex + 1;
      secondLayerIndex < layerMasks.length;
      secondLayerIndex += 1
    ) {
      if (layerMasksOverlap(
        layerMasks[firstLayerIndex]!,
        layers[firstLayerIndex]!.maskResolutionPerChunkAxis,
        layerMasks[secondLayerIndex]!,
        layers[secondLayerIndex]!.maskResolutionPerChunkAxis,
      )) {
        throw new Error(
          `Vegetation layers overlap in chunk (${chunkGridX}, ${chunkGridY}).`,
        );
      }
    }
  }
}

export function hasActiveMaskCell(mask: Uint8Array): boolean {
  return mask.some((cellValue) => cellValue !== 0);
}

export function concatenateStoredLayerMasks(
  storedChunkMasks: readonly (readonly Uint8Array[])[],
  layerIndex: number,
  cellsPerChunk: number,
): Uint8Array {
  const concatenatedMask = new Uint8Array(storedChunkMasks.length * cellsPerChunk);
  for (let chunkIndex = 0; chunkIndex < storedChunkMasks.length; chunkIndex += 1) {
    concatenatedMask.set(
      storedChunkMasks[chunkIndex]![layerIndex]!,
      chunkIndex * cellsPerChunk,
    );
  }
  return concatenatedMask;
}

function layerMasksOverlap(
  firstMask: Uint8Array,
  firstResolution: number,
  secondMask: Uint8Array,
  secondResolution: number,
): boolean {
  for (let firstY = 0; firstY < firstResolution; firstY += 1) {
    for (let firstX = 0; firstX < firstResolution; firstX += 1) {
      if (firstMask[firstY * firstResolution + firstX] !== 1) continue;
      const secondMinimumX = Math.floor(
        (firstX * secondResolution) / firstResolution,
      );
      const secondMaximumX = Math.ceil(
        ((firstX + 1) * secondResolution) / firstResolution,
      ) - 1;
      const secondMinimumY = Math.floor(
        (firstY * secondResolution) / firstResolution,
      );
      const secondMaximumY = Math.ceil(
        ((firstY + 1) * secondResolution) / firstResolution,
      ) - 1;
      for (
        let secondY = secondMinimumY;
        secondY <= secondMaximumY;
        secondY += 1
      ) {
        for (
          let secondX = secondMinimumX;
          secondX <= secondMaximumX;
          secondX += 1
        ) {
          if (secondMask[secondY * secondResolution + secondX] === 1) return true;
        }
      }
    }
  }
  return false;
}

function clamp(value: number, minimumValue: number, maximumValue: number): number {
  return Math.min(maximumValue, Math.max(minimumValue, value));
}
