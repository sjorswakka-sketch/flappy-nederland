import { describe, expect, it } from 'vitest';
import { DIFFICULTY, difficultyAt } from '../src/game/difficulty';
import { makeHazardRow, rectsOverlap, sweptCarHitsHazard, laneCenter, WORLD, headlightBeams, sectorAt, type Hazard } from '../src/game/engine';

function hazard(overrides: Partial<Hazard> = {}): Hazard {
  return { lane: 1, kind: 'traffic', x: laneCenter(1), y: 510, width: 50, height: 80, color: '#fff', targetX: laneCenter(1), signal: 0, shiftTime: 0, speedFactor: 1, closestGap: Infinity, rewarded: false, ...overrides };
}
describe('harder road progression', () => {
  it('starts materially faster and denser, then keeps scaling through very long drives', () => {
    expect(difficultyAt(0).speed).toBeGreaterThanOrEqual(280);
    expect(difficultyAt(0).spawnInterval).toBeLessThanOrEqual(1.12);
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
      expect(next.hazardWidth + 20).toBeLessThan(WORLD.laneWidth);
      expect(next.gap).toBeGreaterThan(0);
      Object.values(next).forEach(value => expect(Number.isFinite(value)).toBe(true));
      previous = next;
    }
  });
  it.each([-1, -Infinity, Infinity, NaN])('normalizes invalid distance %s', distance => expect(difficultyAt(distance)).toEqual(difficultyAt(0)));
  it('reserves a traversable escape corridor even while traffic changes lanes', () => {
    let seed = 31415;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const kinds = new Set<string>();
    let changing = 0;
    for (let i = 0; i < 1500; i++) {
      const row = makeHazardRow(difficultyAt(i * 10000), random);
      expect(row.hazards.length).toBeGreaterThan(0);
      expect(row.hazards.length).toBeLessThanOrEqual(2);
      for (const h of row.hazards) {
        kinds.add(h.kind);
        expect(h.y).toBeLessThan(0);
        expect(h.lane).not.toBe(row.safeLane);
        const minX = Math.min(h.x, h.targetX) - h.width / 2;
        const maxX = Math.max(h.x, h.targetX) + h.width / 2;
        const escape = laneCenter(row.safeLane);
        expect(escape + WORLD.carWidth / 2 < minX || escape - WORLD.carWidth / 2 > maxX).toBe(true);
        if (h.x !== h.targetX) { changing++; expect(h.signal).toBeGreaterThanOrEqual(0.8); }
      }
    }
    expect(kinds).toEqual(new Set(['traffic', 'barrier', 'truck', 'racer']));
    expect(changing).toBeGreaterThan(10);
  });
  it('rotates distinct road sectors by distance without a finite last sector', () => {
    expect([0, 5200, 10400, 15600, 20800].map(sectorAt)).toEqual(['CITY RUN', 'CANAL EXPRESS', 'TUNNEL VISION', 'ROADWORKS', 'CITY RUN']);
  });
});
describe('collision and headlight geometry', () => {
  it('distinguishes overlap from edge touching and adjacent lanes', () => {
    expect(rectsOverlap(0, 0, 10, 10, 9, 9, 5, 5)).toBe(true);
    expect(rectsOverlap(0, 0, 10, 10, 10, 0, 5, 5)).toBe(false);
    expect(sweptCarHitsHazard(laneCenter(1), laneCenter(1), hazard(), 510)).toBe(true);
    expect(sweptCarHitsHazard(laneCenter(0), laneCenter(0), hazard(), 510)).toBe(false);
  });
  it('detects both longitudinal and lateral hazards crossing between simulation steps', () => {
    expect(sweptCarHitsHazard(240, 240, hazard({ y: 700 }), 100)).toBe(true);
    expect(sweptCarHitsHazard(128, 128, hazard({ y: 700 }), 100)).toBe(false);
    expect(sweptCarHitsHazard(240, 240, hazard({ x: 320 }), 510, 120)).toBe(true);
  });
  it('keeps two separate headlight cones with an unlit center strip for every car body', () => {
    for (const width of [41, 44, 49]) {
      const [left, right] = headlightBeams(width, 76);
      expect(left).toHaveLength(4); expect(right).toHaveLength(4);
      expect(Math.max(...left.map(p => p[0]))).toBeLessThanOrEqual(-5);
      expect(Math.min(...right.map(p => p[0]))).toBeGreaterThanOrEqual(5);
    }
  });
});

