import { difficultyAt, type Difficulty } from './difficulty';
import type { VehicleSkin } from '../data/skins';

export const WORLD = { width: 480, height: 640, roadLeft: 72, roadRight: 408, laneWidth: 112, playerY: 510, carWidth: 44, carHeight: 76 } as const;
export const PHYSICS = { step: 1 / 120, steeringResponse: 16, sway: 3.5, reviveGrace: 2 } as const;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
export interface Hazard { lane: number; kind: 'traffic' | 'barrier'; y: number; width: number; height: number; color: string }
export interface HazardRow { hazards: Hazard[]; passed: boolean; safeLane: number }
interface Particle { x: number; y: number; life: number; color: string }
export interface GameSnapshot { status: GameStatus; score: number; distance: number; lane: number; difficulty: Difficulty }
export interface EngineOptions {
  onScore: (score: number) => void;
  onGameOver: (score: number) => void;
  onStateChange?: (status: GameStatus) => void;
  skin: VehicleSkin;
  sound?: boolean;
}

export function laneCenter(lane: number): number { return WORLD.roadLeft + WORLD.laneWidth * (lane + 0.5); }
export function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Relative-motion slab test catches a fast car crossing an obstacle between frames. */
export function sweptCarHitsHazard(fromX: number, toX: number, hazard: Hazard, oldY: number): boolean {
  const x = fromX - laneCenter(hazard.lane);
  const y = WORLD.playerY - oldY;
  const dx = toX - fromX;
  const dy = -(hazard.y - oldY);
  // Slightly inset hitboxes make bumper and mirror edges feel forgiving.
  const halfW = (WORLD.carWidth - 8 + hazard.width - 6) / 2;
  const halfH = (WORLD.carHeight - 12 + hazard.height - 10) / 2;
  let enter = 0; let leave = 1;
  for (const [position, motion, half] of [[x, dx, halfW], [y, dy, halfH]]) {
    if (Math.abs(motion) < 1e-9) { if (Math.abs(position) >= half) return false; continue; }
    const first = (-half - position) / motion;
    const last = (half - position) / motion;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
    if (enter >= leave) return false;
  }
  return leave > 0 && enter < 1;
}

/** Every row leaves a whole lane open; randomness never seals the road. */
export function makeHazardRow(difficulty: Difficulty, random: () => number = Math.random): HazardRow {
  const safeLane = Math.min(2, Math.floor(random() * 3));
  const blocked = [0, 1, 2].filter(lane => lane !== safeLane);
  if (random() < 0.56) blocked.splice(Math.floor(random() * 2), 1);
  const colors = ['#7c9d9f', '#e9d7ab', '#ca7257', '#8c8eab', '#a1b28e'];
  const hazards = blocked.map(lane => {
    const kind = random() < 0.36 ? 'barrier' : 'traffic';
    return {
      lane, kind, y: -WORLD.carHeight - random() * 20,
      width: kind === 'barrier' ? difficulty.hazardWidth + 18 : difficulty.hazardWidth,
      height: kind === 'barrier' ? difficulty.hazardHeight * 0.63 : difficulty.hazardHeight,
      color: colors[Math.min(colors.length - 1, Math.floor(random() * colors.length))],
    } satisfies Hazard;
  });
  return { safeLane, hazards, passed: false };
}

/** Fixed simulation steps decouple handling and collisions from screen refresh rates. */
export class GameEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private status: GameStatus = 'ready';
  private score = 0;
  private distance = 0;
  private lane = 1;
  private x = laneCenter(1);
  private renderedX = laneCenter(1);
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

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: EngineOptions) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser does not support Canvas 2D.');
    this.ctx = context;
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
    this.options.onStateChange?.(status);
  }
  start(): void {
    this.score = 0; this.distance = 0; this.lane = 1;
    this.x = this.renderedX = laneCenter(1); this.rows = []; this.particles = [];
    this.spawnClock = 0; this.invulnerable = 0;
    this.options.onScore(0); this.changeStatus('playing'); this.tone(160, 0.18, 0.035);
  }
  steer(direction: -1 | 1): void {
    if (this.status !== 'playing') return;
    this.lane = Math.max(0, Math.min(2, this.lane + direction)); this.tone(105, 0.04, 0.012);
  }
  pause(): void { if (this.status === 'playing') this.changeStatus('paused'); }
  resume(): void { if (this.status === 'paused') this.changeStatus('playing'); }
  /** UI enforces one continue per run. Score and distance remain part of that run. */
  revive(): void {
    if (this.status !== 'over') return;
    this.rows = []; this.spawnClock = 0; this.lane = 1;
    this.x = this.renderedX = laneCenter(1); this.invulnerable = PHYSICS.reviveGrace;
    this.changeStatus('paused');
  }
  setSkin(skin: VehicleSkin): void { this.options.skin = skin; }
  setSound(sound: boolean): void { this.options.sound = sound; }
  getSnapshot(): GameSnapshot { return { status: this.status, score: this.score, distance: this.distance, lane: this.lane, difficulty: difficultyAt(this.distance) }; }
  destroy(): void { this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); void this.audio?.close(); }
  private tone(frequency: number, duration: number, volume: number): void {
    if (!this.options.sound) return;
    try {
      this.audio ??= new AudioContext(); if (this.audio.state === 'suspended') void this.audio.resume();
      const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.62, this.audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration);
    } catch { /* Blocked optional audio must never stop a drive. */ }
  }
  private tick = (time: number): void => {
    if (this.disposed) return;
    const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.08) : 0;
    this.lastTime = time;
    if (this.status === 'playing') {
      this.accumulator += delta;
      while (this.accumulator >= PHYSICS.step && this.status === 'playing') { this.accumulator -= PHYSICS.step; this.update(PHYSICS.step); }
    } else if (this.status === 'ready') { this.sceneryDistance += delta * 35; this.elapsed += delta; }
    this.draw(); this.frame = requestAnimationFrame(this.tick);
  };
  private update(dt: number): void {
    const difficulty = difficultyAt(this.distance);
    this.elapsed += dt; this.distance += difficulty.speed * dt; this.sceneryDistance += difficulty.speed * dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const previousX = this.renderedX;
    this.x += (laneCenter(this.lane) - this.x) * (1 - Math.exp(-PHYSICS.steeringResponse * dt));
    this.renderedX = this.x + Math.sin(this.elapsed * 3.4) * PHYSICS.sway + Math.sin(this.elapsed * 1.8) * 1.5;
    this.spawnClock += dt;
    if (this.spawnClock >= difficulty.spawnInterval) { this.spawnClock -= difficulty.spawnInterval; this.rows.push(makeHazardRow(difficulty)); }
    for (const row of this.rows) {
      for (const hazard of row.hazards) {
        const oldY = hazard.y; hazard.y += difficulty.speed * dt;
        if (!this.invulnerable && sweptCarHitsHazard(previousX, this.renderedX, hazard, oldY)) { this.end(); return; }
      }
      if (!row.passed && row.hazards.every(hazard => hazard.y - hazard.height / 2 > WORLD.playerY + WORLD.carHeight / 2)) {
        row.passed = true; this.score++; this.options.onScore(this.score); this.tone(610, 0.07, 0.025);
      }
    }
    this.rows = this.rows.filter(row => row.hazards.some(hazard => hazard.y - hazard.height / 2 < WORLD.height + 25));
    if (this.options.skin.effect !== 'none' && Math.random() < dt * 20) this.particles.push({ x: this.renderedX + (Math.random() - 0.5) * 30, y: WORLD.playerY + 33, life: 0.45, color: this.options.skin.accent });
    this.particles.forEach(particle => { particle.y += difficulty.speed * dt * 0.6; particle.life -= dt; });
    this.particles = this.particles.filter(particle => particle.life > 0);
  }
  private end(): void { this.tone(65, 0.25, 0.065); this.changeStatus('over'); this.options.onGameOver(this.score); }

  private draw(): void {
    const ctx = this.ctx; this.drawRoad(ctx);
    this.rows.forEach(row => row.hazards.forEach(hazard => {
      const x = laneCenter(hazard.lane);
      if (hazard.kind === 'barrier') this.drawBarrier(ctx, x, hazard.y, hazard.width, hazard.height);
      else this.drawCar(ctx, x, hazard.y, hazard.width, hazard.height, hazard.color, '#384c56', '#dfe6d7', false, 0);
    }));
    this.particles.forEach(particle => { ctx.globalAlpha = particle.life; ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, 5 * particle.life, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    const skin = this.options.skin;
    const x = this.status === 'ready' ? laneCenter(1) + Math.sin(this.elapsed * 2) * 3 : this.renderedX;
    if (!this.invulnerable || Math.floor(this.elapsed * 10) % 2 === 0) {
      const turn = Math.max(-0.17, Math.min(0.17, (laneCenter(this.lane) - this.x) / 390));
      const width = WORLD.carWidth + (skin.shape === 'royal' ? 5 : skin.shape === 'slim' ? -3 : 0);
      this.drawCar(ctx, x, WORLD.playerY, width, WORLD.carHeight + (skin.shape === 'royal' ? 5 : 0), skin.body, skin.wing, skin.accent, true, turn + Math.sin(this.elapsed * 3.4) * 0.025);
    }
    if (this.status === 'over') { ctx.fillStyle = '#ef8b5645'; ctx.beginPath(); ctx.arc(x, WORLD.playerY, 62, 0, Math.PI * 2); ctx.fill(); }
  }
  private drawRoad(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#122c2e'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    const drift = this.sceneryDistance;
    // Roadside Dutch buildings stay outside the playable road.
    for (let side = 0; side < 2; side++) {
      const edge = side ? 431 : 9;
      for (let i = 0; i < 6; i++) {
        const y = ((i * 154 + drift * 0.4) % 924) - 150;
        ctx.fillStyle = i % 2 ? '#1e3b3d' : '#1a3639'; ctx.fillRect(edge, y, 39, 70);
        ctx.fillStyle = '#7e9d7948';
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) ctx.fillRect(edge + 8 + c * 15, y + 12 + r * 17, 5, 7);
        ctx.fillStyle = '#243b38'; ctx.fillRect(side ? 414 : 63, y + 95, 3, 33);
        ctx.fillStyle = '#b0a675'; ctx.fillRect(side ? 413 : 61, y + 94, 6, 5);
      }
    }
    ctx.fillStyle = '#28333c'; ctx.fillRect(WORLD.roadLeft, 0, WORLD.roadRight - WORLD.roadLeft, WORLD.height);
    ctx.fillStyle = '#202b34'; ctx.fillRect(78, 0, 16, 640); ctx.fillRect(386, 0, 16, 640);
    ctx.fillStyle = '#c4be9a'; ctx.fillRect(83, 0, 3, 640); ctx.fillRect(394, 0, 3, 640);
    ctx.fillStyle = '#9d9c8270';
    for (let i = -1; i < 10; i++) { const y = i * 83 + drift % 83; ctx.fillRect(183, y, 3, 39); ctx.fillRect(295, y, 3, 39); }
    for (let i = -1; i < 11; i++) {
      const y = i * 71 + drift % 71;
      ctx.fillStyle = '#ce8657'; ctx.fillRect(75, y, 4, 9); ctx.fillRect(401, y, 4, 9);
      ctx.fillStyle = '#ffffff05'; ctx.fillRect(94, y + 28, 288, 1);
    }
    const signY = ((drift * 0.3 + 140) % 1000) - 100;
    ctx.fillStyle = '#4f7370'; ctx.fillRect(27, signY + 30, 3, 60);
    this.roundRect(ctx, 7, signY, 57, 37, 3, '#28618a');
    ctx.fillStyle = '#eff6e8'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('A2 ↗', 35, signY + 15);
    ctx.font = '7px system-ui'; ctx.fillText('UTRECHT', 35, signY + 28);
    const millY = ((drift * 0.25 + 370) % 960) - 120;
    ctx.strokeStyle = '#50716a'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(439, millY + 55); ctx.lineTo(447, millY + 13); ctx.lineTo(455, millY + 55); ctx.closePath(); ctx.stroke();
    ctx.save(); ctx.translate(447, millY + 18); ctx.rotate(this.elapsed * 0.5);
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#53726b'; ctx.fillRect(0, -2, 24, 4); } ctx.restore();
  }
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string): void {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  }
  private drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, body: string, roof: string, accent: string, player: boolean, angle: number): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    const left = -width / 2; const top = -height / 2;
    this.roundRect(ctx, left + 4, top + 5, width, height, 10, '#00000037');
    if (player) {
      ctx.fillStyle = '#e7e6aa0c'; ctx.beginPath(); ctx.moveTo(left + 3, top); ctx.lineTo(left - 16, top - 104); ctx.lineTo(width / 2 + 16, top - 104); ctx.lineTo(width / 2 - 3, top); ctx.closePath(); ctx.fill();
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
