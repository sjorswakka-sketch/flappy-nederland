import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine, type HazardRow } from '../src/game/engine';
import { SKINS } from '../src/data/skins';

/** Real simulation/clock with a no-op renderer and repeatable traffic generation. */
function harness() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const context = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  const canvas = { clientWidth: 480, width: 480, height: 640, getContext: () => context } as unknown as HTMLCanvasElement;
  const onScore = vi.fn(); const onGameOver = vi.fn();
  const engine = new GameEngine(canvas, { skin: SKINS[0], onScore, onGameOver });
  let time = 1000;
  function frame(dt = 1 / 60) {
    time += dt * 1000;
    const next = callbacks.entries().next().value;
    if (!next) throw new Error('Engine stopped scheduling frames');
    callbacks.delete(next[0]); next[1](time);
  }
  function advance(seconds: number, fps = 60, pilot = false) {
    for (let i = 0; i < seconds * fps; i++) {
      if (pilot) {
        const rows = (engine as unknown as { rows: HazardRow[] }).rows;
        const approaching = rows.find(row => !row.passed);
        const lane = engine.getSnapshot().lane;
        if (approaching && approaching.safeLane !== lane) engine.steer(approaching.safeLane < lane ? -1 : 1);
      }
      frame(1 / fps);
    }
  }
  frame();
  return { engine, onScore, onGameOver, frame, advance };
}

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.65); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('driving engine lifecycle', () => {
  it('can follow a safe lane through varied traffic and roadworks for a long drive', () => {
    let seed = 9217;
    vi.mocked(Math.random).mockImplementation(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
    const h = harness(); h.engine.start(); h.advance(60, 60, true);
    expect(h.engine.getSnapshot().status).toBe('playing');
    expect(h.engine.getSnapshot().score).toBeGreaterThan(30);
    expect(h.onGameOver).not.toHaveBeenCalled();
    h.engine.destroy();
  });

  it('passes real traffic, scores, progresses, and crashes only once on a blocked lane', () => {
    const h = harness(); h.engine.start(); h.advance(13, 60, true);
    const snapshot = h.engine.getSnapshot();
    expect(snapshot.status).toBe('playing'); expect(snapshot.score).toBeGreaterThanOrEqual(4);
    expect(snapshot.difficulty.speed).toBeGreaterThan(180); expect(snapshot.difficulty.gap).toBeLessThan(66);
    expect(h.onScore).toHaveBeenLastCalledWith(snapshot.score);
    h.engine.steer(-1); h.advance(5);
    expect(h.engine.getSnapshot().status).toBe('over'); expect(h.onGameOver).toHaveBeenCalledTimes(1);
    h.advance(4); expect(h.onGameOver).toHaveBeenCalledTimes(1); h.engine.destroy();
  });

  it('freezes a paused drive and resumes a safe revive without resetting the run', () => {
    const h = harness(); h.engine.start(); h.advance(10, 60, true); h.engine.pause();
    const paused = h.engine.getSnapshot(); h.advance(5); expect(h.engine.getSnapshot()).toEqual(paused);
    h.engine.steer(-1); expect(h.engine.getSnapshot().lane).toBe(paused.lane);
    h.engine.resume(); h.engine.steer(-1); h.advance(5); const dead = h.engine.getSnapshot();
    expect(dead.status).toBe('over'); h.engine.revive();
    expect(h.engine.getSnapshot()).toMatchObject({ status: 'paused', score: dead.score, distance: dead.distance, lane: 1 });
    expect((h.engine as unknown as { rows: HazardRow[] }).rows).toHaveLength(0);
    h.engine.resume(); h.advance(1); expect(h.engine.getSnapshot().status).toBe('playing');
    h.engine.start(); expect(h.engine.getSnapshot()).toMatchObject({ status: 'playing', score: 0, distance: 0, lane: 1 }); h.engine.destroy();
  });

  it('clamps steering to the three lanes and applies equivalent handling at 30 and 120fps', () => {
    function run(fps: number) {
      const h = harness(); h.engine.start(); h.engine.steer(-1); h.engine.steer(-1); h.frame(1 / fps); h.advance(0.5, fps);
      expect(h.engine.getSnapshot().lane).toBe(0);
      const result = { distance: h.engine.getSnapshot().distance, x: (h.engine as unknown as { x: number }).x };
      h.engine.steer(1); h.engine.steer(1); h.engine.steer(1); expect(h.engine.getSnapshot().lane).toBe(2);
      h.engine.destroy(); return result;
    }
    const slow = run(30); const fast = run(120);
    expect(slow.distance).toBeCloseTo(fast.distance, 4); expect(slow.x).toBeCloseTo(fast.x, 4);
  });
});
