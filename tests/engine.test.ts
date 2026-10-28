import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine, PHYSICS, WORLD, laneCenter, type HazardRow, type Hazard } from '../src/game/engine';
import { SKINS } from '../src/data/skins';

interface Internals {
  rows: HazardRow[]; x: number; renderedX: number; spawnClock: number; sceneryDistance: number;
  invulnerable: number; velocityX: number;
}
function harness() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_target, key) => key === 'createLinearGradient' ? () => gradient : () => undefined, set: () => true });
  vi.stubGlobal('window', { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  const canvas = { clientWidth: 480, width: 480, height: 640, getContext: () => context } as unknown as HTMLCanvasElement;
  const onScore = vi.fn(), onGameOver = vi.fn();
  const engine = new GameEngine(canvas, { skin: SKINS[0], onScore, onGameOver });
  const state = engine as unknown as Internals;
  let time = 1000;
  function frame(dt = 1 / 60) {
    time += dt * 1000;
    const next = callbacks.entries().next().value;
    if (!next) throw new Error('Engine stopped scheduling frames');
    callbacks.delete(next[0]); next[1](time);
  }
  function advance(seconds: number, fps = 60, pilot = false) {
    for (let i = 0; i < Math.round(seconds * fps); i++) {
      if (pilot) {
        const row = state.rows.filter(row => !row.passed).sort((a, b) => Math.max(...b.hazards.map(h => h.y)) - Math.max(...a.hazards.map(h => h.y)))[0];
        if (row) engine.setTargetX(laneCenter(row.safeLane) / WORLD.width);
      }
      frame(1 / fps);
    }
  }
  function start() { engine.start(); frame(); }
  function clearTraffic() { state.rows = []; state.spawnClock = -100; }
  function nearPass(xGap = 47) {
    const h: Hazard = {
      lane: 1, kind: 'traffic', x: state.renderedX + xGap, targetX: state.renderedX + xGap,
      y: 490, width: 50, height: 80, color: '#fff', signal: 0, shiftTime: 0, speedFactor: 1, closestGap: Infinity, rewarded: false,
    };
    state.rows = [{ hazards: [h], safeLane: 1, passed: false, speedFactor: 1 }];
  }
  frame();
  return { engine, state, onScore, onGameOver, frame, advance, start, clearTraffic, nearPass };
}
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.65); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('continuous arcade driving', () => {
  it('moves freely between lanes, clamps road edges and releases the steering input', () => {
    const h = harness(); h.start(); h.clearTraffic();
    h.engine.setSteering(-1); h.advance(0.12);
    expect(h.state.x).toBeLessThan(240); expect(h.state.x).toBeGreaterThan(laneCenter(0));
    h.advance(0.5); expect(h.state.x).toBe(WORLD.roadLeft + 27);
    h.engine.setSteering(0); h.advance(0.5); const stopped = h.state.x;
    h.advance(0.5); expect(h.state.x).toBeCloseTo(stopped, 4);
    h.engine.setTargetX(0.7); h.advance(0.6); expect(h.state.x).toBeCloseTo(336, 0);
    h.engine.setTargetX(null); h.engine.setSteering(1); h.advance(1); expect(h.state.x).toBe(WORLD.roadRight - 27);
    h.engine.destroy();
  });
  it('has equivalent physics at30 and120fps and makes the road move faster than relative traffic', () => {
    function run(fps: number) {
      const h = harness(); h.engine.start(); h.frame(1 / fps); h.clearTraffic();
      h.engine.setSteering(-1); h.advance(0.3, fps); h.engine.setSteering(1); h.advance(0.6, fps);
      const result = { distance: h.engine.getSnapshot().distance, x: h.state.x, drift: h.state.sceneryDistance };
      h.engine.destroy(); return result;
    }
    const slow = run(30), fast = run(120);
    expect(slow.distance).toBeCloseTo(fast.distance, 5);
    expect(slow.x).toBeCloseTo(fast.x, 5);
    expect(slow.drift).toBeGreaterThan(slow.distance * 1.7);
  });
  it('demands active steering: remaining in the start lane crashes within the opening waves', () => {
    const h = harness(); h.start(); h.advance(9);
    expect(h.engine.getSnapshot().status).toBe('over');
    expect(h.onGameOver).toHaveBeenCalledTimes(1);
    h.advance(3); expect(h.onGameOver).toHaveBeenCalledTimes(1); h.engine.destroy();
  });
  it('can weave a seeded60second mixed-traffic run through its reserved escape corridors', () => {
    let seed = 9217;
    vi.mocked(Math.random).mockImplementation(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
    const h = harness(); h.start(); h.advance(60, 60, true);
    expect(h.engine.getSnapshot().status).toBe('playing');
    expect(h.engine.getSnapshot().score).toBeGreaterThan(45);
    expect(h.engine.getSnapshot().difficulty.speed).toBeGreaterThan(420);
    expect(h.onGameOver).not.toHaveBeenCalled(); h.engine.destroy();
  });
  it('keeps pause frozen and repairs safely without resetting distance or score', () => {
    const h = harness(); h.start(); h.advance(8);
    const dead = h.engine.getSnapshot(); expect(dead.status).toBe('over');
    h.engine.revive(); expect(h.engine.getSnapshot()).toMatchObject({ status: 'paused', score: dead.score, distance: dead.distance, lane: 1 });
    const paused = h.engine.getSnapshot(); h.advance(3); expect(h.engine.getSnapshot()).toEqual(paused);
    h.engine.resume(); h.frame(); h.advance(0.5); expect(h.engine.getSnapshot().status).toBe('playing');
    expect(h.state.invulnerable).toBeGreaterThan(1);
    h.engine.start(); expect(h.engine.getSnapshot()).toMatchObject({ status: 'playing', score: 0, distance: 0, nearMisses: 0, combo: 1, boostCharge: 100 });
    h.engine.destroy();
  });
});
describe('nitro and risk scoring', () => {
  it('spends charge on a short speed boost without granting collision protection', () => {
    const h = harness(); h.start(); h.clearTraffic();
    const before = h.engine.getSnapshot();
    expect(h.engine.boost()).toBe(true); expect(h.engine.boost()).toBe(false);
    expect(h.engine.getSnapshot()).toMatchObject({ boostCharge: 65, boostActive: true });
    expect(h.engine.getSnapshot().speedKph).toBeGreaterThan(before.speedKph * 1.4);
    expect(h.state.invulnerable).toBe(0);
    h.advance(PHYSICS.boostSeconds + 0.1); expect(h.engine.getSnapshot().boostActive).toBe(false);
    h.engine.destroy();
  });
  it('awards each near miss once, builds a combo and restores earned nitro', () => {
    const h = harness(); h.start(); h.clearTraffic(); h.engine.boost();
    h.nearPass(); h.advance(0.4);
    expect(h.engine.getSnapshot().nearMisses).toBe(1);
    expect(h.engine.getSnapshot().score).toBeGreaterThanOrEqual(4);
    expect(h.engine.getSnapshot().boostCharge).toBeGreaterThan(80);
    h.nearPass(); h.advance(0.4);
    expect(h.engine.getSnapshot()).toMatchObject({ nearMisses: 2, combo: 2 });
    const score = h.engine.getSnapshot().score;
    h.advance(0.5); expect(h.engine.getSnapshot().score).toBe(score);
    h.clearTraffic(); h.advance(5.1);
    expect(h.engine.getSnapshot().combo).toBe(1);
    expect(h.onScore).toHaveBeenLastCalledWith(score);
    h.engine.destroy();
  });
  it('does not treat a comfortable gap as a near miss or permit boost while paused', () => {
    const h = harness(); h.start(); h.clearTraffic(); h.nearPass(80); h.advance(0.5);
    expect(h.engine.getSnapshot()).toMatchObject({ nearMisses: 0, combo: 1, score: 1 });
    h.engine.pause(); expect(h.engine.boost()).toBe(false);
    h.engine.setSteering(-1); const x = h.state.x; h.advance(1); expect(h.state.x).toBe(x);
    h.engine.destroy();
  });
});

