/** Every progression value is tuned here. Distance is measured in road pixels. */
export const DIFFICULTY = {
  baseSpeed: 280,
  speedGrowth: 62,
  distanceScale: 2400,
  baseSpawnInterval: 1.12,
  minSpawnInterval: 0.66,
  baseHazardWidth: 50,
  maxHazardWidth: 75,
  baseHazardHeight: 80,
  maxHazardHeight: 108,
  laneWidth: 112,
  progressionScale: 11000,
  roadVisualMultiplier: 1.72,
} as const;
export interface Difficulty {
  speed: number; spawnInterval: number; hazardWidth: number; hazardHeight: number;
  gap: number; level: number;
}
/** Speed stays unbounded; geometry approaches limits with a usable escape lane. */
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
    level: 1 + Math.floor(d / 3200),
  };
}

