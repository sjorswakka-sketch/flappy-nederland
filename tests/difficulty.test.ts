import { describe, expect, it } from 'vitest';
import { DIFFICULTY, difficultyAt } from '../src/game/difficulty';
import { circleHitsRect, WORLD } from '../src/game/engine';

describe('distance-based difficulty', () => {
  it('keeps every difficulty dimension monotonic through very long flights', () => {
    const distances = [0, 1, 100, 2_600, 11_500, 100_000, 1_000_000, 1_000_000_000];
    let previous = difficultyAt(0);
    for (const distance of distances.slice(1)) {
      const next = difficultyAt(distance);
      expect(next.speed).toBeGreaterThan(previous.speed);
      expect(next.spawnInterval).toBeLessThan(previous.spawnInterval);
      expect(next.pipeWidth).toBeGreaterThan(previous.pipeWidth);
      expect(next.gap).toBeLessThan(previous.gap);
      expect(next.spawnInterval).toBeGreaterThanOrEqual(DIFFICULTY.minSpawnInterval);
      expect(next.pipeWidth).toBeLessThanOrEqual(DIFFICULTY.maxPipeWidth);
      expect(next.gap).toBeGreaterThanOrEqual(DIFFICULTY.minGap);
      expect(next.gap).toBeGreaterThan(WORLD.birdRadius * 2);
      for (const value of Object.values(next)) expect(Number.isFinite(value)).toBe(true);
      previous = next;
    }
  });

  it('keeps increasing speed beyond the point where geometry is near its limits', () => {
    expect(difficultyAt(1e12).speed).toBeGreaterThan(difficultyAt(1e9).speed);
    expect(difficultyAt(0)).toMatchObject({
      speed: DIFFICULTY.baseSpeed,
      gap: DIFFICULTY.baseGap,
      pipeWidth: DIFFICULTY.basePipeWidth,
      spawnInterval: DIFFICULTY.baseSpawnInterval,
    });
  });

  it.each([-1, -Infinity, Infinity, NaN])('handles invalid starting distance %s', (distance) => {
    expect(difficultyAt(distance)).toEqual(difficultyAt(0));
  });
});

describe('bird collision geometry', () => {
  it('detects overlapping pipe faces and bird centers inside a pipe', () => {
    expect(circleHitsRect(95, 50, 10, 100, 0, 50, 100)).toBe(true);
    expect(circleHitsRect(125, 50, 10, 100, 0, 50, 100)).toBe(true);
  });

  it('does not collide simply because the bird bounding box touches a pipe corner', () => {
    expect(circleHitsRect(93, -7, 9, 100, 0, 50, 100)).toBe(false);
    expect(circleHitsRect(94, -6, 9, 100, 0, 50, 100)).toBe(true);
    expect(circleHitsRect(70, 50, 10, 100, 0, 50, 100)).toBe(false);
  });
});
