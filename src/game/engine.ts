import { difficultyAt, type Difficulty } from './difficulty';
import type { BirdSkin } from '../data/skins';

export const WORLD = { width: 480, height: 640, ground: 584, birdX: 132, birdRadius: 14 } as const;
export const PHYSICS = { gravity: 1080, flapVelocity: -342, maxFallSpeed: 520, step: 1 / 120 } as const;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
export interface Pipe { x: number; width: number; center: number; gap: number; passed: boolean }
interface Particle { x: number; y: number; life: number; color: string }
export interface GameSnapshot { status: GameStatus; score: number; distance: number; difficulty: Difficulty }
export interface EngineOptions {
  onScore: (score: number) => void;
  onGameOver: (score: number) => void;
  onStateChange?: (status: GameStatus) => void;
  skin: BirdSkin;
  sound?: boolean;
}

/** Circle/rectangle intersection avoids unfair collisions at the bird's corners. */
export function circleHitsRect(x: number, y: number, radius: number, left: number, top: number, width: number, height: number): boolean {
  const nearestX = Math.max(left, Math.min(x, left + width));
  const nearestY = Math.max(top, Math.min(y, top + height));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}

/** Physics uses a fixed timestep, independent of monitor refresh rate. UI owns inputs. */
export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private status: GameStatus = 'ready';
  private score = 0;
  private distance = 0;
  private y = 278;
  private velocity = 0;
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private spawnClock = 0;
  private elapsed = 0;
  private sceneryDistance = 0;
  private invulnerable = 0;
  private lastTime = 0;
  private accumulator = 0;
  private frame = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private audio?: AudioContext;

  constructor(private canvas: HTMLCanvasElement, options: EngineOptions) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('This browser does not support Canvas 2D.');
    this.ctx = ctx;
    this.options = options;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(1, this.canvas.clientWidth);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(width * ratio * WORLD.height / WORLD.width);
    this.ctx.setTransform(this.canvas.width / WORLD.width, 0, 0, this.canvas.height / WORLD.height, 0, 0);
  }

  private changeStatus(status: GameStatus): void {
    this.status = status;
    this.accumulator = 0;
    this.lastTime = 0;
    this.options.onStateChange?.(status);
  }

  start(): void {
    this.score = 0;
    this.distance = 0;
    this.y = 278;
    this.velocity = PHYSICS.flapVelocity;
    this.pipes = [];
    this.particles = [];
    this.spawnClock = 0.6; // A clear runway before the first obstacle.
    this.invulnerable = 0;
    this.options.onScore(0);
    this.changeStatus('playing');
    this.tone(580, 0.055, 0.04);
  }

  flap(): void {
    if (this.status === 'ready') { this.start(); return; }
    if (this.status !== 'playing') return;
    this.velocity = PHYSICS.flapVelocity;
    this.tone(520, 0.045, 0.025);
  }

  pause(): void { if (this.status === 'playing') this.changeStatus('paused'); }
  resume(): void { if (this.status === 'paused') this.changeStatus('playing'); }

  /** One-per-run reward policy is enforced by the app, not this rendering layer. */
  revive(): void {
    if (this.status !== 'over') return;
    this.y = 278;
    this.velocity = PHYSICS.flapVelocity;
    this.pipes = this.pipes.filter(pipe => pipe.x > WORLD.birdX + 260);
    this.spawnClock = 0;
    this.invulnerable = 2;
    this.changeStatus('paused');
  }

  setSkin(skin: BirdSkin): void { this.options.skin = skin; }
  setSound(sound: boolean): void { this.options.sound = sound; }
  getSnapshot(): GameSnapshot { return { status: this.status, score: this.score, distance: this.distance, difficulty: difficultyAt(this.distance) }; }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    void this.audio?.close();
  }

  private tone(frequency: number, duration: number, volume: number): void {
    if (!this.options.sound) return;
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, this.audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(this.audio.destination);
      oscillator.start(); oscillator.stop(this.audio.currentTime + duration);
    } catch { /* Audio support must never prevent play. */ }
  }

  private tick = (time: number): void => {
    if (this.disposed) return;
    const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.08) : 0;
    this.lastTime = time;
    this.elapsed += delta;
    if (this.status === 'playing') {
      this.accumulator += delta;
      while (this.accumulator >= PHYSICS.step && this.status === 'playing') {
        this.accumulator -= PHYSICS.step;
        this.update(PHYSICS.step);
      }
    } else if (this.status === 'ready') {
      this.sceneryDistance += delta * 22;
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  private update(dt: number): void {
    const difficulty = difficultyAt(this.distance);
    this.distance += difficulty.speed * dt;
    this.sceneryDistance += difficulty.speed * dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.velocity = Math.min(PHYSICS.maxFallSpeed, this.velocity + PHYSICS.gravity * dt);
    this.y += this.velocity * dt;
    this.spawnClock += dt;
    if (this.spawnClock >= difficulty.spawnInterval) {
      this.spawnClock -= difficulty.spawnInterval;
      this.spawnPipe(difficulty);
    }
    for (const pipe of this.pipes) {
      pipe.x -= difficulty.speed * dt;
      if (!pipe.passed && pipe.x + pipe.width + 8 < WORLD.birdX - WORLD.birdRadius) {
        pipe.passed = true;
        this.score++;
        this.options.onScore(this.score);
        this.tone(870, 0.1, 0.05);
        for (let i = 0; i < 7; i++) this.particles.push({ x: WORLD.birdX + Math.random() * 15, y: this.y + (Math.random() - 0.5) * 35, life: 0.65 + Math.random() * 0.3, color: '#ffc45b' });
      }
      const lip = 7;
      const top = pipe.center - pipe.gap / 2;
      const bottom = pipe.center + pipe.gap / 2;
      // The wider cap has its own hitbox; invisible side padding must not kill a run.
      const hit = circleHitsRect(WORLD.birdX, this.y, WORLD.birdRadius, pipe.x, -20, pipe.width, top + 20)
        || circleHitsRect(WORLD.birdX, this.y, WORLD.birdRadius, pipe.x - lip, top - 21, pipe.width + lip * 2, 21)
        || circleHitsRect(WORLD.birdX, this.y, WORLD.birdRadius, pipe.x, bottom, pipe.width, WORLD.ground - bottom)
        || circleHitsRect(WORLD.birdX, this.y, WORLD.birdRadius, pipe.x - lip, bottom, pipe.width + lip * 2, 21);
      if (!this.invulnerable && hit) {
        this.end(); return;
      }
    }
    this.pipes = this.pipes.filter(pipe => pipe.x + pipe.width > -20);
    for (const particle of this.particles) { particle.x -= difficulty.speed * dt * 0.5; particle.life -= dt; particle.y += 25 * dt; }
    this.particles = this.particles.filter(particle => particle.life > 0);
    // Boundaries still apply during a revive grace period, so the player cannot hide.
    if (this.y - WORLD.birdRadius <= 0 || this.y + WORLD.birdRadius >= WORLD.ground) this.end();
  }

  private spawnPipe(difficulty: Difficulty): void {
    const previous = this.pipes[this.pipes.length - 1];
    const baseCenter = previous?.center ?? 290;
    const edgeToEdgeTime = Math.max(0.2, difficulty.spawnInterval - difficulty.pipeWidth / difficulty.speed);
    // Limit vertical variation to the time available between obstacles.
    const variation = Math.min(102, edgeToEdgeTime * 95);
    const minCenter = 85 + difficulty.gap / 2;
    const maxCenter = WORLD.ground - 70 - difficulty.gap / 2;
    const center = Math.max(minCenter, Math.min(maxCenter, baseCenter + (Math.random() - 0.5) * variation * 2));
    this.pipes.push({ x: WORLD.width + 20, width: difficulty.pipeWidth, center, gap: difficulty.gap, passed: false });
  }

  private end(): void {
    this.tone(150, 0.18, 0.07);
    this.changeStatus('over');
    this.options.onGameOver(this.score);
  }

  private draw(): void {
    const ctx = this.ctx;
    this.drawLandscape(ctx);
    this.pipes.forEach(pipe => this.drawPipe(ctx, pipe));
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, 3 * particle.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const birdY = this.status === 'ready' ? 278 + Math.sin(this.elapsed * 3) * 9 : this.y;
    if (!this.invulnerable || Math.floor(this.elapsed * 12) % 2 === 0) this.drawBird(ctx, WORLD.birdX, birdY);
    this.drawGround(ctx);
  }

  private drawLandscape(ctx: CanvasRenderingContext2D): void {
    const drift = this.sceneryDistance;
    ctx.fillStyle = '#d9edf2'; ctx.fillRect(0, 0, 480, 640);
    ctx.fillStyle = '#f7efcf'; ctx.beginPath(); ctx.arc(376, 114, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#edf6f4';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 146 + 44 - drift * 0.07) % 800 + 800) % 800 - 110;
      const y = 66 + (i % 3) * 59;
      this.cloud(ctx, x, y, 0.8 + (i % 2) * 0.3);
    }
    // Far polders and slow windmills give depth without cluttering the play area.
    ctx.fillStyle = '#c6dcd2';
    ctx.beginPath(); ctx.moveTo(0, 445);
    for (let x = 0; x <= 500; x += 10) ctx.lineTo(x, 438 + Math.sin((x + drift * 0.1) / 99) * 16);
    ctx.lineTo(480, 584); ctx.lineTo(0, 584); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const x = ((i * 280 + 195 - drift * 0.13) % 850 + 850) % 850 - 100;
      this.windmill(ctx, x, 465, 0.68 + (i % 2) * 0.2);
    }
    ctx.fillStyle = '#b1cfc0';
    ctx.beginPath(); ctx.moveTo(0, 495);
    for (let x = 0; x <= 500; x += 10) ctx.lineTo(x, 490 + Math.sin((x + drift * 0.2) / 70) * 11);
    ctx.lineTo(480, 584); ctx.lineTo(0, 584); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = ((i * 75 + 20 - drift * 0.25) % 630 + 630) % 630 - 75;
      this.house(ctx, x, 531, i);
    }
    ctx.fillStyle = '#97bdc2'; ctx.fillRect(0, 539, 480, 45);
    ctx.strokeStyle = '#c0d8d6'; ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const x = ((i * 76 - drift * 0.35) % 650 + 650) % 650 - 100;
      ctx.beginPath(); ctx.moveTo(x, 550 + (i % 3) * 10); ctx.lineTo(x + 29, 550 + (i % 3) * 10); ctx.stroke();
    }
  }

  private cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.beginPath(); ctx.ellipse(0, 7, 38, 12, 0, 0, Math.PI * 2); ctx.ellipse(-12, 0, 19, 16, 0, 0, Math.PI * 2); ctx.ellipse(11, -5, 21, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  private windmill(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#8fab9e'; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-11, -65); ctx.lineTo(11, -65); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#748f86'; ctx.beginPath(); ctx.moveTo(-15, -65); ctx.lineTo(0, -82); ctx.lineTo(15, -65); ctx.closePath(); ctx.fill();
    ctx.translate(0, -65); ctx.rotate(this.elapsed * 0.32);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2); ctx.strokeStyle = '#77968b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -52); ctx.stroke();
      ctx.fillStyle = '#a1bdb0'; ctx.fillRect(2, -51, 9, 37);
      ctx.strokeStyle = '#77968b'; ctx.lineWidth = 1;
      for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.moveTo(2, -49 + j * 8); ctx.lineTo(11, -49 + j * 8); ctx.stroke(); }
    }
    ctx.fillStyle = '#6f8a80'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  private house(ctx: CanvasRenderingContext2D, x: number, baseline: number, index: number): void {
    const h = 42 + (index % 3) * 13;
    const colors = ['#d0b6a1', '#9caeaa', '#b4a69b', '#c6b7a5'];
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(x, baseline - h, 35, h);
    ctx.beginPath(); ctx.moveTo(x - 3, baseline - h); ctx.lineTo(x + 17.5, baseline - h - 19); ctx.lineTo(x + 38, baseline - h); ctx.fill();
    ctx.fillStyle = '#e4e2ce';
    for (let row = 0; row < Math.floor(h / 18); row++) for (let col = 0; col < 2; col++) ctx.fillRect(x + 7 + col * 14, baseline - h + 9 + row * 17, 6, 8);
    ctx.fillStyle = '#80958c'; ctx.fillRect(x + 14, baseline - 15, 8, 15);
    ctx.fillStyle = '#8fa99c'; ctx.fillRect(x - 1, baseline, 39, 5);
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#789778'; ctx.fillRect(0, WORLD.ground, 480, 8);
    ctx.fillStyle = '#ece2c5'; ctx.fillRect(0, WORLD.ground + 8, 480, 48);
    ctx.strokeStyle = '#d5c9a9'; ctx.lineWidth = 1;
    const offset = this.sceneryDistance % 32;
    for (let x = -32; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x - offset, 604); ctx.lineTo(x + 22 - offset, 604); ctx.stroke(); }
    for (let i = 0; i < 14; i++) {
      const x = ((i * 45 - this.sceneryDistance * 0.8) % 630 + 630) % 630 - 45;
      ctx.strokeStyle = '#5f855b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 585); ctx.lineTo(x, 574); ctx.stroke();
      ctx.fillStyle = i % 3 === 0 ? '#d97852' : '#e19c61';
      ctx.beginPath(); ctx.moveTo(x - 5, 570); ctx.lineTo(x - 3, 566); ctx.lineTo(x, 570); ctx.lineTo(x + 3, 566); ctx.lineTo(x + 5, 570); ctx.quadraticCurveTo(x + 5, 578, x, 578); ctx.quadraticCurveTo(x - 5, 577, x - 5, 570); ctx.fill();
    }
  }

  private drawPipe(ctx: CanvasRenderingContext2D, pipe: Pipe): void {
    const top = pipe.center - pipe.gap / 2;
    const bottom = pipe.center + pipe.gap / 2;
    ctx.fillStyle = '#70938d'; ctx.strokeStyle = '#4c736e'; ctx.lineWidth = 2;
    ctx.fillRect(pipe.x, -5, pipe.width, top + 5); ctx.strokeRect(pipe.x, -5, pipe.width, top + 5);
    ctx.fillRect(pipe.x, bottom, pipe.width, WORLD.ground - bottom); ctx.strokeRect(pipe.x, bottom, pipe.width, WORLD.ground - bottom);
    ctx.fillStyle = '#88a9a1'; ctx.fillRect(pipe.x + 5, 0, 9, top - 9); ctx.fillRect(pipe.x + 5, bottom + 10, 9, WORLD.ground - bottom - 10);
    ctx.fillStyle = '#537d77'; ctx.fillRect(pipe.x + pipe.width - 9, 0, 7, top - 9); ctx.fillRect(pipe.x + pipe.width - 9, bottom + 10, 7, WORLD.ground - bottom - 10);
    ctx.fillStyle = '#e4cf94'; ctx.strokeStyle = '#9f956b';
    ctx.beginPath(); ctx.roundRect(pipe.x - 7, top - 21, pipe.width + 14, 21, 4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(pipe.x - 7, bottom, pipe.width + 14, 21, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2dfab'; ctx.fillRect(pipe.x - 3, top - 18, pipe.width + 6, 5); ctx.fillRect(pipe.x - 3, bottom + 3, pipe.width + 6, 5);
    // A small tricolour plaque is the only decoration on each obstacle.
    const plaqueY = bottom + 43;
    if (plaqueY + 12 < WORLD.ground) {
      ctx.fillStyle = '#c37366'; ctx.fillRect(pipe.x + pipe.width / 2 - 8, plaqueY, 16, 4);
      ctx.fillStyle = '#f4eedb'; ctx.fillRect(pipe.x + pipe.width / 2 - 8, plaqueY + 4, 16, 4);
      ctx.fillStyle = '#6c86a2'; ctx.fillRect(pipe.x + pipe.width / 2 - 8, plaqueY + 8, 16, 4);
    }
  }

  private drawBird(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const skin = this.options.skin;
    ctx.save(); ctx.translate(x, y);
    ctx.rotate(this.status === 'playing' ? Math.max(-0.38, Math.min(1.1, this.velocity / 570)) : -0.08);
    if (skin.effect === 'trail') {
      ctx.globalAlpha = 0.3; ctx.fillStyle = skin.accent;
      ctx.beginPath(); ctx.ellipse(-25, 4, 16, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = skin.wing; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-30, -8); ctx.lineTo(-26, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.body; ctx.strokeStyle = '#314d50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, skin.shape === 'slim' ? 23 : 22, skin.shape === 'slim' ? 16 : 19, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = skin.accent; ctx.beginPath(); ctx.ellipse(7, 8, 13, 9, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin.wing;
    const flap = Math.sin(this.elapsed * (this.status === 'playing' ? 23 : 6)) * 0.4;
    ctx.save(); ctx.translate(-7, 3); ctx.rotate(flap);
    ctx.beginPath(); ctx.ellipse(-3, 1, 12, 7, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#fff9e9'; ctx.beginPath(); ctx.ellipse(12, -6, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#263e45'; ctx.beginPath(); ctx.arc(15, -6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#edb550'; ctx.beginPath(); ctx.moveTo(20, -1); ctx.lineTo(31, 3); ctx.lineTo(20, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (skin.shape === 'royal') {
      ctx.fillStyle = '#eabe4d'; ctx.strokeStyle = '#a7802a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-10, -17); ctx.lineTo(-13, -30); ctx.lineTo(-5, -25); ctx.lineTo(0, -33); ctx.lineTo(5, -25); ctx.lineTo(12, -30); ctx.lineTo(9, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (skin.effect === 'sparkle') {
      ctx.strokeStyle = skin.accent; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const sx = Math.cos(this.elapsed * 2 + i * 2.1) * 33;
        const sy = Math.sin(this.elapsed * 2 + i * 2.1) * 28;
        ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy); ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
