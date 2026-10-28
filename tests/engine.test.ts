import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine, PHYSICS, WORLD } from '../src/game/engine';
import { SKINS } from '../src/data/skins';

/** Headless rendering harness: real engine/clock, deterministic obstacle generation. */
function harness() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const context = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback); return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  const canvas = { clientWidth: 480, width: 480, height: 640, getContext: () => context } as unknown as HTMLCanvasElement;
  const onScore = vi.fn();
  const onGameOver = vi.fn();
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
      const bird = engine as unknown as { y: number; velocity: number };
      if (pilot && bird.y > 300 && bird.velocity > 0) engine.flap();
      frame(1 / fps);
    }
  }
  frame();
  return { engine, onScore, onGameOver, frame, advance };
}

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('playable engine lifecycle', () => {
  it('scores real obstacle passes, scales difficulty, and ends only once on a fall', () => {
    const h = harness();
    h.engine.start();
    h.advance(12, 60, true);
    const snapshot = h.engine.getSnapshot();
    expect(snapshot.status).toBe('playing');
    expect(snapshot.score).toBeGreaterThanOrEqual(4);
    expect(snapshot.difficulty.speed).toBeGreaterThan(145);
    expect(snapshot.difficulty.gap).toBeLessThan(208);
    expect(h.onScore).toHaveBeenLastCalledWith(snapshot.score);
    h.advance(3);
    expect(h.engine.getSnapshot().status).toBe('over');
    expect(h.onGameOver).toHaveBeenCalledTimes(1);
    expect(h.onGameOver).toHaveBeenCalledWith(h.engine.getSnapshot().score);
    h.engine.destroy();
  });

  it('stops physics during pause and restores a safe, paused revive without losing points', () => {
    const h = harness();
    h.engine.start(); h.advance(8, 60, true);
    h.engine.pause();
    const paused = h.engine.getSnapshot();
    h.advance(5);
    expect(h.engine.getSnapshot()).toEqual(paused);
    h.engine.resume(); h.advance(3);
    const dead = h.engine.getSnapshot();
    expect(dead.status).toBe('over');
    h.engine.revive();
    expect(h.engine.getSnapshot()).toMatchObject({ status: 'paused', score: dead.score, distance: dead.distance });
    h.engine.resume(); h.advance(1, 60, true);
    expect(h.engine.getSnapshot().status).toBe('playing');
    h.engine.start();
    expect(h.engine.getSnapshot()).toMatchObject({ status: 'playing', score: 0, distance: 0 });
    h.engine.destroy();
  });

  it('uses equivalent physics at 30 and 120 frames per second', () => {
    function run(fps: number) {
      const h = harness(); h.engine.start(); h.frame(1 / fps); h.advance(0.4, fps);
      const bird = h.engine as unknown as { y: number; velocity: number };
      const snapshot = { ...h.engine.getSnapshot(), y: bird.y, velocity: bird.velocity };
      h.engine.destroy(); return snapshot;
    }
    const slow = run(30);
    const fast = run(120);
    expect(slow.status).toBe('playing');
    expect(slow.distance).toBeCloseTo(fast.distance, 4);
    expect(slow.y).toBeCloseTo(fast.y, 4);
    expect(slow.velocity).toBeCloseTo(fast.velocity, 4);
    expect(Math.abs(PHYSICS.flapVelocity)).toBeLessThan(WORLD.height);
  });
});
