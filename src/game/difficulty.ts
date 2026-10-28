/** Road progression in logical pixels. Change these constants to tune every run. */
export const DIFFICULTY = {
  baseSpeed: 180,
  speedGrowth: 38,
  distanceScale: 3200,
  baseSpawnInterval: 1.7,
  minSpawnInterval: 0.93,
  baseHazardWidth: 46,
  maxHazardWidth: 73,
  baseHazardHeight: 77,
  maxHazardHeight: 104,
  laneWidth: 112,
  progressionScale: 14000,
} as const;

export interface Difficulty {
  speed: number;
  spawnInterval: number;
  hazardWidth: number;
  hazardHeight: number;
  gap: number;
  level: number;
}

/** Speed has no ceiling; traffic frequency and geometry approach usable limits. */
export function difficultyAt(distance: number): Difficulty {
  const d = Math.max(0, Number.isFinite(distance) ? distance : 0);
  const progress = d / (d + DIFFICULTY.progressionScale);
  const hazardWidth = DIFFICULTY.baseHazardWidth + (DIFFICULTY.maxHazardWidth - DIFFICULTY.baseHazardWidth) * progress;
  return {
    speed: DIFFICULTY.baseSpeed + DIFFICULTY.speedGrowth * Math.log1p(d / DIFFICULTY.distanceScale),
    spawnInterval: DIFFICULTY.baseSpawnInterval - (DIFFICULTY.baseSpawnInterval - DIFFICULTY.minSpawnInterval) * progress,
    hazardWidth,
    hazardHeight: DIFFICULTY.baseHazardHeight + (DIFFICULTY.maxHazardHeight - DIFFICULTY.baseHazardHeight) * progress,
    gap: DIFFICULTY.laneWidth - hazardWidth,
    level: 1 + Math.floor(d / DIFFICULTY.distanceScale),
  };
}
