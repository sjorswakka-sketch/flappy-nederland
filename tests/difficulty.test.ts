import { describe, expect, it } from 'vitest';
import { DIFFICULTY, difficultyAt } from '../src/game/difficulty';
import { makeHazardRow, rectsOverlap, sweptCarHitsHazard, laneCenter, WORLD, type Hazard } from '../src/game/engine';

describe('distance-based road difficulty', () => {
  it('smoothly increases speed, frequency and hazard size through very long drives', () => {
    let previous = difficultyAt(0);
    for (const distance of [1, 100, 3200, 14000, 100000, 1000000, 1e9, 1e12]) {
      const next = difficultyAt(distance);
      expect(next.speed).toBeGreaterThan(previous.speed);
      expect(next.spawnInterval).toBeLessThan(previous.spawnInterval);
      expect(next.hazardWidth).toBeGreaterThan(previous.hazardWidth);
      expect(next.hazardHeight).toBeGreaterThan(previous.hazardHeight);
      expect(next.gap).toBeLessThan(previous.gap);
      expect(next.spawnInterval).toBeGreaterThanOrEqual(DIFFICULTY.minSpawnInterval);
      expect(next.hazardWidth).toBeLessThanOrEqual(DIFFICULTY.maxHazardWidth);
      expect(next.hazardWidth + 18).toBeLessThan(WORLD.laneWidth);
      expect(next.gap).toBeGreaterThan(0);
      Object.values(next).forEach(value => expect(Number.isFinite(value)).toBe(true)); previous = next;
    }
  });
  it.each([-1, -Infinity, Infinity, NaN])('normalizes invalid starting distance %s', distance => {
    expect(difficultyAt(distance)).toEqual(difficultyAt(0));
  });
  it('never generates more than two blocked lanes and leaves its promised safe lane empty', () => {
    let seed = 31415;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const kinds = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const row = makeHazardRow(difficultyAt(i * 10000), random);
      expect(row.hazards.length).toBeGreaterThan(0); expect(row.hazards.length).toBeLessThanOrEqual(2);
      expect(new Set(row.hazards.map(h => h.lane)).size).toBe(row.hazards.length);
      expect(row.hazards.every(h => h.lane !== row.safeLane)).toBe(true);
      row.hazards.forEach(h => kinds.add(h.kind));
    }
    expect(kinds).toEqual(new Set(['traffic', 'barrier']));
  });
});

describe('vehicle collision geometry', () => {
  const hazard: Hazard = { lane: 1, kind: 'traffic', y: 510, width: 46, height: 77, color: '#fff' };
  it('distinguishes overlap from adjacent lanes and mere touching edges', () => {
    expect(rectsOverlap(0, 0, 10, 10, 9, 9, 5, 5)).toBe(true);
    expect(rectsOverlap(0, 0, 10, 10, 10, 0, 5, 5)).toBe(false);
    expect(sweptCarHitsHazard(laneCenter(1), laneCenter(1), hazard, 510)).toBe(true);
    expect(sweptCarHitsHazard(laneCenter(0), laneCenter(0), hazard, 510)).toBe(false);
  });
  it('detects traffic crossing the entire player between two updates', () => {
    expect(sweptCarHitsHazard(laneCenter(1), laneCenter(1), { ...hazard, y: 700 }, 100)).toBe(true);
    expect(sweptCarHitsHazard(laneCenter(0), laneCenter(0), { ...hazard, y: 700 }, 100)).toBe(false);
  });
});
