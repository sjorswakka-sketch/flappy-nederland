/** All progression tuning lives here. Distance is measured in world pixels. */
export const DIFFICULTY = {
  baseSpeed: 145,
  speedGrowth: 32,
  distanceScale: 2600,
  baseSpawnInterval: 2.05,
  minSpawnInterval: 1.1,
  basePipeWidth: 64,
  maxPipeWidth: 103,
  baseGap: 208,
  minGap: 143,
  progressionScale: 11500,
} as const;

export interface Difficulty {
  speed: number;
  spawnInterval: number;
  pipeWidth: number;
  gap: number;
  level: number;
}

/** Speed grows without a cap. Geometry approaches playable limits smoothly. */
export function difficultyAt(distance: number): Difficulty {
  const d = Math.max(0, Number.isFinite(distance) ? distance : 0);
  const progress = d / (d + DIFFICULTY.progressionScale);
  return {
    speed: DIFFICULTY.baseSpeed + DIFFICULTY.speedGrowth * Math.log1p(d / DIFFICULTY.distanceScale),
    spawnInterval: DIFFICULTY.baseSpawnInterval - (DIFFICULTY.baseSpawnInterval - DIFFICULTY.minSpawnInterval) * progress,
    pipeWidth: DIFFICULTY.basePipeWidth + (DIFFICULTY.maxPipeWidth - DIFFICULTY.basePipeWidth) * progress,
    gap: DIFFICULTY.baseGap - (DIFFICULTY.baseGap - DIFFICULTY.minGap) * progress,
    level: 1 + Math.floor(d / DIFFICULTY.distanceScale),
  };
}
