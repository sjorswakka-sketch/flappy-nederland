import { DIFFICULTY, difficultyAt, type Difficulty } from './difficulty';
import type { VehicleSkin } from '../data/skins';
import { defaultUpgradeLevels, upgradeEffects, type UpgradeLevels } from '../data/upgrades';

export const WORLD = { width: 480, height: 640, roadLeft: 72, roadRight: 408, laneWidth: 112, playerY: 510, carWidth: 44, carHeight: 76 } as const;
export const PHYSICS = { step: 1 / 120, steeringSpeed: 520, steeringResponse: 15, sway: 4, reviveGrace: 2, boostCost: 35, boostSeconds: 1.7, boostMultiplier: 1.5 } as const;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
export type RoadSector = 'CITY RUN' | 'CANAL EXPRESS' | 'TUNNEL VISION' | 'ROADWORKS';
export interface Hazard {
  lane: number; kind: 'traffic' | 'barrier' | 'truck' | 'racer';
  x: number; y: number; width: number; height: number; color: string;
  targetX: number; signal: number; shiftTime: number; speedFactor: number;
  closestGap: number; rewarded: boolean;
}
export interface HazardRow { hazards: Hazard[]; passed: boolean; safeLane: number; speedFactor: number }
interface Particle { x: number; y: number; life: number; color: string; vx: number }
export interface GameSnapshot {
  status: GameStatus; score: number; distance: number; lane: number; difficulty: Difficulty;
  speedKph: number; nearMisses: number; combo: number; boostCharge: number; boostActive: boolean; sector: RoadSector;
}
export interface EngineOptions {
  onScore: (score: number) => void; onGameOver: (score: number) => void;
  onStateChange?: (status: GameStatus) => void; skin: VehicleSkin; sound?: boolean;
  /** Permanent garage upgrades are frozen for the duration of a run. */
  upgrades?: UpgradeLevels;
}
export function laneCenter(lane: number): number { return WORLD.roadLeft + WORLD.laneWidth * (lane + 0.5); }
export function sectorAt(distance: number): RoadSector {
  return (['CITY RUN', 'CANAL EXPRESS', 'TUNNEL VISION', 'ROADWORKS'] as const)[Math.floor(Math.max(0, distance) / 5200) % 4];
}
/** Separate beam polygons keep a dark strip between the two physical headlamps. */
export function headlightBeams(width: number, height: number): [number, number][][] {
  const front = -height / 2;
  return ([-1, 1] as const).map(side => {
    const lamp = side * (width / 2 - 9);
    return [[lamp - 3, front + 2], [side * (width / 2 + 34), front - 158], [side * 5, front - 158], [lamp + 3, front + 2]];
  });
}
export function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
/** Swept relative-motion AABB catches even a boosted pass between simulation steps. */
export function sweptCarHitsHazard(fromX: number, toX: number, hazard: Hazard, oldY: number, oldHazardX = hazard.x): boolean {
  const x = fromX - oldHazardX;
  const y = WORLD.playerY - oldY;
  const dx = toX - fromX - (hazard.x - oldHazardX);
  const dy = -(hazard.y - oldY);
  const halfW = (WORLD.carWidth - 8 + hazard.width - 8) / 2;
  const halfH = (WORLD.carHeight - 12 + hazard.height - 10) / 2;
  let enter = 0; let leave = 1;
  for (const [position, motion, half] of [[x, dx, halfW], [y, dy, halfH]]) {
    if (Math.abs(motion) < 1e-9) { if (Math.abs(position) >= half) return false; continue; }
    const first = (-half - position) / motion, last = (half - position) / motion;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
    if (enter >= leave) return false;
  }
  return leave > 0 && enter < 1;
}
/**
 * A wave always reserves an escape corridor. Indicator-led lane changes occur only
 * between its other lanes, so a telegraphed move cannot seal that corridor.
 */
export function makeHazardRow(difficulty: Difficulty, random: () => number = Math.random, safeLaneOverride?: number, roadworks = false): HazardRow {
  const safeLane = safeLaneOverride ?? Math.min(2, Math.floor(random() * 3));
  const lanes = [0, 1, 2].filter(lane => lane !== safeLane);
  if (!roadworks && random() < 0.24) lanes.splice(Math.floor(random() * 2), 1);
  const colors = ['#75b9c4', '#eee1a6', '#d96755', '#9d8ec6', '#82b690', '#c2b7a0'];
  const speedFactor = 0.86 + random() * 0.15;
  const hazards: Hazard[] = lanes.map(lane => {
    const roll = random();
    const kind: Hazard['kind'] = roadworks ? (roll < 0.78 ? 'barrier' : 'truck') : roll < 0.22 ? 'barrier' : roll < 0.42 ? 'truck' : roll < 0.62 ? 'racer' : 'traffic';
    const x = laneCenter(lane);
    const other = [0, 1, 2].find(candidate => candidate !== lane && candidate !== safeLane && Math.abs(candidate - lane) === 1);
    const shifts = lanes.length === 1 && kind === 'racer' && other !== undefined;
    return {
      lane, kind, x, y: -90,
      width: difficulty.hazardWidth + (kind === 'barrier' ? 20 : kind === 'truck' ? 12 : kind === 'racer' ? -5 : 0),
      height: difficulty.hazardHeight * (kind === 'barrier' ? 0.62 : kind === 'truck' ? 1.32 : 1),
      color: colors[Math.min(colors.length - 1, Math.floor(random() * colors.length))],
      targetX: shifts ? laneCenter(other) : x,
      signal: shifts ? 0.8 : 0, shiftTime: 0,
      speedFactor, closestGap: Infinity, rewarded: false,
    };
  });
  return { safeLane, hazards, passed: false, speedFactor };
}

/** Independent fixed-step simulation; inputs, scores and reward policy belong to UI. */
export class GameEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: boolean;
  private status: GameStatus = 'ready';
  private score = 0;
  private scoreRemainder = 0;
  private upgradeModifiers = upgradeEffects(defaultUpgradeLevels());
  private distance = 0;
  private x = laneCenter(1);
  private renderedX = laneCenter(1);
  private velocityX = 0;
  private steering: -1 | 0 | 1 = 0;
  private targetX: number | null = null;
  private nudgeTime = 0;
  private rows: HazardRow[] = [];
  private particles: Particle[] = [];
  private spawnClock = 0;
  private elapsed = 0;
  private sceneryDistance = 0;
  private invulnerable = 0;
  private lastTime = 0;
  private accumulator = 0;
  private frame = 0;
  private disposed = false;
  private audio?: AudioContext;
  private lastSafeLane = 1;
  private repeatedSafeLane = 0;
  private nearMisses = 0;
  private combo = 1;
  private comboHits = 0;
  private comboClock = 0;
  private boostCharge = 100;
  private boostTime = 0;
  private shake = 0;
  private notification = '';
  private notificationTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: EngineOptions) {
    this.setUpgrades(options.upgrades ?? defaultUpgradeLevels());
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser does not support Canvas 2D.');
    this.ctx = context;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas); this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }
  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(Math.max(1, this.canvas.clientWidth) * dpr);
    this.canvas.height = Math.round(this.canvas.width * WORLD.height / WORLD.width);
    this.ctx.setTransform(this.canvas.width / WORLD.width, 0, 0, this.canvas.height / WORLD.height, 0, 0);
  }
  private changeStatus(status: GameStatus): void {
    this.status = status; this.accumulator = 0; this.lastTime = 0;
    if (status !== 'playing') { this.steering = 0; this.targetX = null; this.nudgeTime = 0; }
    this.options.onStateChange?.(status);
  }
  start(): void {
    this.score = 0; this.scoreRemainder = 0; this.distance = 0; this.elapsed = 0;
    this.x = this.renderedX = laneCenter(1); this.velocityX = 0;
    this.steering = 0; this.targetX = null; this.rows = []; this.particles = [];
    this.spawnClock = 0; this.invulnerable = 0; this.nearMisses = 0;
    this.combo = 1; this.comboHits = 0; this.comboClock = 0; this.boostCharge = 100; this.boostTime = 0;
    this.lastSafeLane = 1; this.repeatedSafeLane = 0; this.notification = ''; this.notificationTime = 0;
    this.rows.push(makeHazardRow(difficultyAt(0), Math.random, 1));
    this.options.onScore(0); this.changeStatus('playing'); this.tone(160, 0.18, 0.035);
  }
  setSteering(value: -1 | 0 | 1): void {
    if (this.status !== 'playing') return;
    this.steering = value; this.targetX = null; this.nudgeTime = 0;
  }
  /** Compatibility nudge for a click; held controls should use setSteering. */
  steer(direction: -1 | 1): void {
    if (this.status !== 'playing') return;
    this.steering = direction; this.targetX = null; this.nudgeTime = 0.19;
  }
  /** Pointer target is normalized against the entire canvas, not a specific lane. */
  setTargetX(normalized: number | null): void {
    if (this.status !== 'playing') return;
    this.targetX = normalized === null ? null : Math.max(WORLD.roadLeft + 27, Math.min(WORLD.roadRight - 27, Math.max(0, Math.min(1, normalized)) * WORLD.width));
    this.steering = 0; this.nudgeTime = 0;
  }
  boost(): boolean {
    if (this.status !== 'playing' || this.boostTime > 0 || this.boostCharge < PHYSICS.boostCost) return false;
    this.boostCharge -= PHYSICS.boostCost; this.boostTime = PHYSICS.boostSeconds * this.upgradeModifiers.boostDurationMultiplier;
    this.notification = 'NITRO · DOUBLE POINTS'; this.notificationTime = 1;
    this.tone(330, 0.18, 0.03); return true;
  }
  pause(): void { if (this.status === 'playing') this.changeStatus('paused'); }
  resume(): void { if (this.status === 'paused') this.changeStatus('playing'); }
  revive(): void {
    if (this.status !== 'over') return;
    this.rows = []; this.spawnClock = -0.25; this.x = this.renderedX = laneCenter(1);
    this.velocityX = 0; this.invulnerable = PHYSICS.reviveGrace; this.boostTime = 0;
    this.combo = 1; this.comboHits = 0; this.comboClock = 0; this.boostCharge = Math.max(35, this.boostCharge);
    this.changeStatus('paused');
  }
  /** Purchase effects take hold between runs, never during play or a repair pause. */
  setUpgrades(levels: UpgradeLevels): boolean {
    if (this.status === 'playing' || this.status === 'paused') return false;
    // Shared normalization returns primitive modifiers; callers cannot mutate a run.
    this.upgradeModifiers = upgradeEffects({ ...levels });
    return true;
  }
  private currentSpeed(difficulty: Difficulty = difficultyAt(this.distance)): number {
    return difficulty.speed * this.upgradeModifiers.speedMultiplier * (this.boostTime > 0 ? PHYSICS.boostMultiplier : 1);
  }
  setSkin(skin: VehicleSkin): void { this.options.skin = skin; }
  setSound(sound: boolean): void { this.options.sound = sound; }
  getSnapshot(): GameSnapshot {
    const difficulty = difficultyAt(this.distance);
    return {
      status: this.status, score: this.score, distance: this.distance,
      lane: Math.max(0, Math.min(2, Math.floor((this.x - WORLD.roadLeft) / WORLD.laneWidth))),
      difficulty, speedKph: Math.round(this.currentSpeed(difficulty) * 0.36),
      nearMisses: this.nearMisses, combo: this.combo, boostCharge: this.boostCharge, boostActive: this.boostTime > 0,
      sector: sectorAt(this.distance),
    };
  }
  destroy(): void { this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); void this.audio?.close(); }
  private tone(frequency: number, duration: number, volume: number): void {
    if (!this.options.sound) return;
    try {
      this.audio ??= new AudioContext(); if (this.audio.state === 'suspended') void this.audio.resume();
      const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.62, this.audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration);
    } catch { /* Audio is optional. */ }
  }
  private tick = (time: number): void => {
    if (this.disposed) return;
    const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.08) : 0;
    this.lastTime = time;
    if (this.status === 'playing') {
      this.accumulator += delta;
      while (this.accumulator >= PHYSICS.step && this.status === 'playing') { this.accumulator -= PHYSICS.step; this.update(PHYSICS.step); }
    } else if (this.status === 'ready') { this.sceneryDistance += delta * 150; this.elapsed += delta; }
    this.draw(); this.frame = requestAnimationFrame(this.tick);
  };
  private addScore(points: number): void {
    // Carry fractional bonuses forward: +15% must matter even on one-point passes.
    this.scoreRemainder += points * this.upgradeModifiers.scoreMultiplier;
    const wholePoints = Math.floor(this.scoreRemainder + 1e-9);
    this.scoreRemainder = Math.max(0, this.scoreRemainder - wholePoints);
    this.score = Math.min(Number.MAX_SAFE_INTEGER, this.score + wholePoints);
    this.options.onScore(this.score);
  }
  private nextRow(difficulty: Difficulty): HazardRow {
    let safe = this.lastSafeLane;
    if (this.repeatedSafeLane >= 1 || Math.random() < 0.72) {
      safe = safe === 0 ? 1 : safe === 2 ? 1 : Math.random() < 0.5 ? 0 : 2;
    }
    this.repeatedSafeLane = safe === this.lastSafeLane ? this.repeatedSafeLane + 1 : 0;
    this.lastSafeLane = safe;
    return makeHazardRow(difficulty, Math.random, safe, sectorAt(this.distance) === 'ROADWORKS');
  }
  private update(dt: number): void {
    const difficulty = difficultyAt(this.distance);
    const speed = this.currentSpeed(difficulty);
    this.elapsed += dt; this.distance += speed * dt;
    // Fast road texture is independent of fair relative traffic speed: cars are also moving.
    this.sceneryDistance += speed * DIFFICULTY.roadVisualMultiplier * dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.boostCharge = Math.min(100, this.boostCharge + dt * 0.5 * this.upgradeModifiers.boostRechargeMultiplier);
    this.comboClock = Math.max(0, this.comboClock - dt);
    if (!this.comboClock) { this.combo = 1; this.comboHits = 0; }
    this.notificationTime = Math.max(0, this.notificationTime - dt);
    this.shake = Math.max(0, this.shake - dt * 5);
    if (this.nudgeTime > 0) { this.nudgeTime -= dt; if (this.nudgeTime <= 0) this.steering = 0; }
    const previousX = this.renderedX;
    const steeringSpeed = PHYSICS.steeringSpeed * this.upgradeModifiers.steeringMultiplier;
    const steeringResponse = PHYSICS.steeringResponse * this.upgradeModifiers.steeringResponseMultiplier;
    let wantedVelocity = this.steering * steeringSpeed;
    if (this.targetX !== null) wantedVelocity = Math.max(-steeringSpeed, Math.min(steeringSpeed, (this.targetX - this.x) * 12 * this.upgradeModifiers.steeringResponseMultiplier));
    this.velocityX += (wantedVelocity - this.velocityX) * (1 - Math.exp(-steeringResponse * dt));
    const nextX = this.x + this.velocityX * dt;
    // Stop at a finger target instead of oscillating across it after a fast drag.
    if (this.targetX !== null && (this.targetX - this.x) * (this.targetX - nextX) <= 0) {
      this.x = this.targetX; this.velocityX = 0;
    } else this.x = Math.max(WORLD.roadLeft + 27, Math.min(WORLD.roadRight - 27, nextX));
    const sway = (Math.sin(this.elapsed * 3.4) * PHYSICS.sway + Math.sin(this.elapsed * 1.8) * 1.5) * this.upgradeModifiers.swayMultiplier;
    this.renderedX = this.x + sway;
    this.spawnClock += dt;
    if (this.spawnClock >= difficulty.spawnInterval) { this.spawnClock -= difficulty.spawnInterval; this.rows.push(this.nextRow(difficulty)); }
    for (const row of this.rows) {
      for (const hazard of row.hazards) {
        const oldY = hazard.y, oldX = hazard.x;
        hazard.y += speed * hazard.speedFactor * dt;
        if (hazard.signal > 0) hazard.signal = Math.max(0, hazard.signal - dt);
        else if (hazard.x !== hazard.targetX) {
          hazard.shiftTime += dt;
          const change = Math.min(Math.abs(hazard.targetX - hazard.x), dt * 105);
          hazard.x += Math.sign(hazard.targetX - hazard.x) * change;
        }
        if (!this.invulnerable && sweptCarHitsHazard(previousX, this.renderedX, hazard, oldY, oldX)) { this.end(); return; }
        const vertical = Math.abs(hazard.y - WORLD.playerY);
        if (vertical < (WORLD.carHeight - 12 + hazard.height - 10) / 2) {
          const gap = Math.abs(this.renderedX - hazard.x) - (WORLD.carWidth - 8 + hazard.width - 8) / 2;
          if (gap >= 0) hazard.closestGap = Math.min(hazard.closestGap, gap);
        }
        if (!hazard.rewarded && hazard.y - hazard.height / 2 > WORLD.playerY + WORLD.carHeight / 2) {
          hazard.rewarded = true;
          if (!this.invulnerable && hazard.closestGap < 13) {
            this.nearMisses++; this.comboHits++; this.combo = Math.min(5, 1 + Math.floor(this.comboHits / 2)); this.comboClock = 5;
            this.boostCharge = Math.min(100, this.boostCharge + 14 * this.upgradeModifiers.boostRechargeMultiplier); this.addScore(2 * this.combo);
            this.notification = 'NEAR MISS  +' + 2 * this.combo; this.notificationTime = 0.8;
            this.tone(780, 0.065, 0.035);
            for (let i = 0; i < 8; i++) this.particles.push({ x: this.renderedX, y: WORLD.playerY + 25, vx: (Math.random() - 0.5) * 90, life: 0.5, color: '#d3fc8b' });
          }
        }
      }
      if (!row.passed && row.hazards.every(hazard => hazard.rewarded)) {
        row.passed = true; this.addScore(this.combo * (this.boostTime > 0 ? 2 : 1));
        this.boostCharge = Math.min(100, this.boostCharge + 3 * this.upgradeModifiers.boostRechargeMultiplier);
      }
    }
    this.rows = this.rows.filter(row => row.hazards.some(hazard => hazard.y - hazard.height / 2 < WORLD.height + 35));
    if ((this.boostTime > 0 || this.options.skin.effect !== 'none') && Math.random() < dt * (this.boostTime > 0 ? 70 : 15)) {
      this.particles.push({ x: this.renderedX + (Math.random() - 0.5) * 25, y: WORLD.playerY + 35, vx: (Math.random() - 0.5) * 20, life: this.boostTime > 0 ? 0.42 : 0.3, color: this.boostTime > 0 ? '#91e5ff' : this.options.skin.accent });
    }
    this.particles.forEach(p => { p.y += speed * dt * 0.8; p.x += p.vx * dt; p.life -= dt; });
    this.particles = this.particles.filter(p => p.life > 0).slice(-100);
  }
  private end(): void {
    this.shake = this.reducedMotion ? 0 : 1; this.tone(65, 0.25, 0.065);
    this.changeStatus('over'); this.options.onGameOver(this.score);
  }
  private draw(): void {
    const ctx = this.ctx; ctx.save();
    if (this.shake && !this.reducedMotion) ctx.translate(Math.sin(this.elapsed * 100) * 3 * this.shake, Math.cos(this.elapsed * 93) * 2 * this.shake);
    this.drawRoad(ctx);
    for (const row of this.rows) for (const hazard of row.hazards) {
      if (hazard.kind === 'barrier') this.drawBarrier(ctx, hazard.x, hazard.y, hazard.width, hazard.height);
      else if (hazard.kind === 'truck') this.drawTruck(ctx, hazard);
      else this.drawCar(ctx, hazard.x, hazard.y, hazard.width, hazard.height, hazard.color, '#304453', '#e8dfb7', false, hazard.targetX !== hazard.x && !hazard.signal ? Math.sign(hazard.targetX - hazard.x) * 0.065 : 0);
      if (hazard.signal > 0 && Math.floor(this.elapsed * 9) % 2 === 0) {
        ctx.fillStyle = '#ffc363'; ctx.fillRect(hazard.x + Math.sign(hazard.targetX - hazard.x) * (hazard.width / 2 + 3) - 3, hazard.y + 8, 6, 13);
      }
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y, 3, this.boostTime > 0 ? 12 : 4);
    }
    ctx.globalAlpha = 1;
    const skin = this.options.skin;
    const x = this.status === 'ready' ? laneCenter(1) + Math.sin(this.elapsed * 2) * 3 * this.upgradeModifiers.swayMultiplier : this.renderedX;
    if (!this.invulnerable || Math.floor(this.elapsed * 10) % 2 === 0) {
      if (this.boostTime > 0) {
        ctx.fillStyle = '#84d9ff18'; ctx.beginPath(); ctx.moveTo(x - 20, WORLD.playerY + 32); ctx.lineTo(x - 30, 640); ctx.lineTo(x + 30, 640); ctx.lineTo(x + 20, WORLD.playerY + 32); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b6efff'; ctx.fillRect(x - 14, WORLD.playerY + 36, 6, 13 + Math.sin(this.elapsed * 40) * 5); ctx.fillRect(x + 8, WORLD.playerY + 36, 6, 13 + Math.cos(this.elapsed * 35) * 5);
      }
      const angle = Math.max(-0.16, Math.min(0.16, this.velocityX / 2600)) + Math.sin(this.elapsed * 3.4) * 0.025 * this.upgradeModifiers.swayMultiplier;
      this.drawCar(ctx, x, WORLD.playerY, WORLD.carWidth + (skin.shape === 'royal' ? 5 : skin.shape === 'slim' ? -3 : 0), WORLD.carHeight + (skin.shape === 'royal' ? 5 : 0), skin.body, skin.wing, skin.accent, true, angle);
    }
    if (this.notificationTime && this.status === 'playing') {
      ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#d8ffa8';
      ctx.fillText(this.notification, 240, WORLD.playerY - 85 - (1 - this.notificationTime) * 15);
    }
    if (this.status === 'over') {
      ctx.fillStyle = '#ed895838'; ctx.beginPath(); ctx.arc(x, WORLD.playerY, 62, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f6af70'; ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) { const a = i * 0.7; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 35, WORLD.playerY + Math.sin(a) * 35); ctx.lineTo(x + Math.cos(a) * 55, WORLD.playerY + Math.sin(a) * 55); ctx.stroke(); }
    }
    ctx.restore();
  }
  private drawRoad(ctx: CanvasRenderingContext2D): void {
    const sector = sectorAt(this.distance), drift = this.sceneryDistance, tunnel = sector === 'TUNNEL VISION';
    ctx.fillStyle = tunnel ? '#101c26' : sector === 'CANAL EXPRESS' ? '#103638' : '#142d2b'; ctx.fillRect(0, 0, 480, 640);
    // Close road furniture scrolls quickly; distant architecture moves more slowly.
    for (let side = 0; side < 2; side++) {
      const edge = side ? 432 : 8;
      for (let i = -1; i < 8; i++) {
        const y = ((i * 115 + drift * 0.42) % 920 + 920) % 920 - 120;
        ctx.fillStyle = tunnel ? '#203541' : i % 2 ? '#23413c' : '#1b3737'; ctx.fillRect(edge, y, 39, 79);
        ctx.fillStyle = '#c8d49345';
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) ctx.fillRect(edge + 8 + c * 15, y + 11 + r * 19, 5, 8);
      }
      for (let i = -1; i < 10; i++) {
        const y = (i * 82 + drift) % 820 - 82;
        ctx.fillStyle = '#7c9873'; ctx.fillRect(side ? 418 : 59, y, 3, 29);
        ctx.fillStyle = tunnel ? '#80c8e4' : '#dfdc9b'; ctx.fillRect(side ? 412 : 56, y, 13, 4);
        ctx.fillStyle = '#e8e9a90b'; ctx.beginPath(); ctx.ellipse(side ? 402 : 78, y + 24, 24, 58, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = tunnel ? '#28313a' : '#303942'; ctx.fillRect(WORLD.roadLeft, 0, 336, 640);
    ctx.fillStyle = '#1d2a32'; ctx.fillRect(78, 0, 14, 640); ctx.fillRect(388, 0, 14, 640);
    ctx.fillStyle = '#aeb39a'; ctx.fillRect(83, 0, 3, 640); ctx.fillRect(394, 0, 3, 640);
    ctx.fillStyle = '#d7d6b79a';
    for (let i = -1; i < 13; i++) { const y = i * 64 + drift % 64; ctx.fillRect(183, y, 3, 29); ctx.fillRect(295, y, 3, 29); }
    for (let i = -1; i < 18; i++) {
      const y = i * 43 + drift % 43;
      ctx.fillStyle = sector === 'ROADWORKS' ? '#fda35a' : '#d9dca2'; ctx.fillRect(75, y, 4, 10); ctx.fillRect(401, y, 4, 10);
      // Asphalt seams and wet reflected lane paint sell speed without changing hitboxes.
      ctx.fillStyle = '#c5dbe207'; ctx.fillRect(96, y + 23, 287, 2);
      ctx.fillStyle = '#d2dde50b'; ctx.fillRect(118 + (i * 37) % 220, y, 1, 24);
    }
    if (this.status === 'playing' && !this.reducedMotion) {
      const streakAlpha = this.boostTime > 0 ? '72' : '24';
      ctx.strokeStyle = '#bee4e8' + streakAlpha; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const x = i % 2 ? 93 + (i * 13) % 35 : 350 + (i * 17) % 36;
        const y = (i * 79 + drift * 1.4) % 720 - 80;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (this.boostTime > 0 ? 74 : 34)); ctx.stroke();
      }
    }
    if (tunnel) {
      ctx.fillStyle = '#7cb6c914';
      for (let i = -1; i < 5; i++) { const y = i * 170 + drift % 170; ctx.fillRect(73, y, 334, 8); }
      ctx.fillStyle = '#81c5dc'; ctx.fillRect(79, 0, 2, 640); ctx.fillRect(399, 0, 2, 640);
    }
    const signY = ((drift * 0.55 + 110) % 1000) - 130;
    this.roundRect(ctx, 6, signY, 58, 43, 3, '#286e8f');
    ctx.fillStyle = '#edf7e9'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('A2 ↗', 35, signY + 17);
    ctx.font = '7px system-ui'; ctx.fillText(sector === 'CANAL EXPRESS' ? 'AMSTERDAM' : 'UTRECHT', 35, signY + 31);
    const overpassY = ((drift + 500) % 2900) - 150;
    if (overpassY > -90 && overpassY < 690) {
      ctx.fillStyle = '#060e1755'; ctx.fillRect(73, overpassY, 334, 32);
      ctx.fillStyle = '#adbfad0e'; ctx.fillRect(73, overpassY + 29, 334, 3);
    }
  }
  private drawTruck(ctx: CanvasRenderingContext2D, hazard: Hazard): void {
    const { x, y, width: w, height: h } = hazard;
    this.roundRect(ctx, x - w / 2 + 4, y - h / 2 + 7, w, h, 5, '#0006');
    this.roundRect(ctx, x - w / 2, y - h / 2, w, h, 6, hazard.color);
    this.roundRect(ctx, x - w / 2 + 5, y - h / 2 + 9, w - 10, 22, 3, '#1e3c49');
    this.roundRect(ctx, x - w / 2 + 2, y - h / 2 + 39, w - 4, h - 43, 3, '#b8c4b2');
    ctx.strokeStyle = '#6f8b85'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const lineY = y - h / 2 + 48 + i * 13; ctx.beginPath(); ctx.moveTo(x - w / 2 + 7, lineY); ctx.lineTo(x + w / 2 - 7, lineY); ctx.stroke(); }
    ctx.fillStyle = '#f7dea4'; ctx.fillRect(x - w / 2 + 5, y - h / 2 + 3, 10, 4); ctx.fillRect(x + w / 2 - 15, y - h / 2 + 3, 10, 4);
    ctx.fillStyle = '#d55e43'; ctx.fillRect(x - w / 2 + 4, y + h / 2 - 6, 10, 3); ctx.fillRect(x + w / 2 - 14, y + h / 2 - 6, 10, 3);
  }
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string): void {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  }
  private drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, body: string, roof: string, accent: string, player: boolean, angle: number): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    const left = -width / 2; const top = -height / 2;
    this.roundRect(ctx, left + 4, top + 5, width, height, 10, '#00000037');
    if (player) {
      for (const beam of headlightBeams(width, height)) {
        const light = ctx.createLinearGradient(0, top, 0, top - 160);
        light.addColorStop(0, 'rgba(231,247,202,0.25)');
        light.addColorStop(0.55, 'rgba(216,239,200,0.09)');
        light.addColorStop(1, 'rgba(199,233,212,0.015)');
        ctx.fillStyle = light; ctx.beginPath();
        beam.forEach(([bx, by], index) => index ? ctx.lineTo(bx, by) : ctx.moveTo(bx, by));
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ed9f5830'; ctx.fillRect(left - 4, top + 9, width + 8, height - 12);
    }
    this.roundRect(ctx, left - 3, top + 10, 7, 17, 2, '#101b22'); this.roundRect(ctx, width / 2 - 4, top + 10, 7, 17, 2, '#101b22');
    this.roundRect(ctx, left - 3, height / 2 - 25, 7, 17, 2, '#101b22'); this.roundRect(ctx, width / 2 - 4, height / 2 - 25, 7, 17, 2, '#101b22');
    this.roundRect(ctx, left, top, width, height, 10, body);
    this.roundRect(ctx, left + 6, top + height * 0.29, width - 12, height * 0.43, 5, roof);
    this.roundRect(ctx, left + 8, top + height * 0.29, width - 16, height * 0.16, 3, '#263f4b');
    this.roundRect(ctx, left + 8, top + height * 0.61, width - 16, height * 0.11, 2, '#233b43');
    ctx.fillStyle = accent; ctx.globalAlpha = 0.6; ctx.fillRect(-2, top + 6, 4, height * 0.18); ctx.fillRect(-2, height / 2 - 14, 4, 9); ctx.globalAlpha = 1;
    this.roundRect(ctx, left + 5, top + 3, 9, 4, 2, '#fff0b7'); this.roundRect(ctx, width / 2 - 14, top + 3, 9, 4, 2, '#fff0b7');
    this.roundRect(ctx, left + 5, height / 2 - 6, 9, 3, 1, '#b64f43'); this.roundRect(ctx, width / 2 - 14, height / 2 - 6, 9, 3, 1, '#b64f43');
    ctx.fillStyle = '#f1cb63'; ctx.fillRect(-7, height / 2 - 6, 14, 3);
    if (player && this.options.skin.shape === 'royal') { ctx.fillStyle = '#e4cc83'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★', 0, 5); }
    ctx.restore();
  }
  private drawBarrier(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.save(); ctx.translate(x, y);
    this.roundRect(ctx, -width / 2 + 3, -height / 2 + 5, width, height, 5, '#00000035');
    this.roundRect(ctx, -width / 2, -height / 2, width, height, 5, '#ea8e4a');
    ctx.save(); ctx.beginPath(); ctx.rect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6); ctx.clip(); ctx.strokeStyle = '#f1e2b9'; ctx.lineWidth = 10;
    for (let i = -3; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-width / 2 + i * 24, height / 2); ctx.lineTo(-width / 2 + i * 24 + height, -height / 2); ctx.stroke(); } ctx.restore();
    for (const side of [-1, 1]) { const coneX = side * (width / 2 - 9); ctx.fillStyle = '#d97338'; ctx.beginPath(); ctx.moveTo(coneX, -height / 2 - 15); ctx.lineTo(coneX - 6, -height / 2); ctx.lineTo(coneX + 6, -height / 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff0cd'; ctx.fillRect(coneX - 3, -height / 2 - 6, 6, 3); }
    ctx.restore();
  }
}

