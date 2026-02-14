import { Renderer } from '../game/renderer';
import type { DebugState, HudState, Settings, VirtualStickInput } from '../types/game';
import { GameLoop } from './gameLoop';
import { InputController, type RestartMode } from './input';
import { createSeed, mulberry32 } from './rng';

type Vec2 = { x: number; y: number };

type TrailPoint = Vec2 & { life: number };

type WorldState = {
  width: number;
  height: number;
  elapsedSeconds: number;
  seed: number;
  gridOffset: Vec2;
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    hp: number;
    radius: number;
  };
  trail: TrailPoint[];
};

type EngineSystem = (dt: number, world: WorldState) => void;

type EngineCallbacks = {
  onHudChange: (hud: HudState) => void;
  onDebugChange: (debug: DebugState) => void;
  onPauseToggle: () => void;
  isPaused: () => boolean;
  isGameOver: () => boolean;
  getSettings: () => Settings;
};

const PLAYER_ACCEL = 920;
const DASH_IMPULSE = 320;
const FRICTION = 3.5;
const MAX_SPEED = 420;
const TRAIL_LIFE = 0.45;

export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputController;
  private readonly renderer: Renderer;
  private readonly callbacks: EngineCallbacks;
  private readonly loop: GameLoop;
  private readonly systems: EngineSystem[];

  private world: WorldState;
  private random = mulberry32(0);
  private debugEnabled = false;
  private fps = 0;
  private lastRenderAt = performance.now();

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.input = new InputController();

    this.world = this.createWorld();
    this.restart('new_seed');

    this.renderer = new Renderer(this.ctx);
    this.systems = [this.movementSystem, this.trailSystem];

    this.loop = new GameLoop({
      update: this.update,
      render: this.render,
    });
  }

  start(): void {
    this.resize();
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.input.dispose();
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.world.width = this.canvas.width;
    this.world.height = this.canvas.height;

    this.world.player.x = clamp(this.world.player.x || this.world.width / 2, 0, this.world.width);
    this.world.player.y = clamp(this.world.player.y || this.world.height / 2, 0, this.world.height);
    this.render();
  }

  setTouchMovement(input: VirtualStickInput): void {
    this.input.setTouchMovement(input);
  }

  setTouchDash(isPressed: boolean): void {
    this.input.setTouchDash(isPressed);
  }

  restart(mode: RestartMode): void {
    const seed = mode === 'same_seed' ? this.world.seed : createSeed();
    this.random = mulberry32(seed);

    this.world.elapsedSeconds = 0;
    this.world.seed = seed;
    this.world.gridOffset = { x: this.random() * 48, y: this.random() * 48 };
    this.world.player = {
      x: this.world.width * 0.5,
      y: this.world.height * 0.5,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      hp: 100,
      radius: 12,
    };
    this.world.trail = [];
    this.emitHud();
  }

  private update = (dt: number): void => {
    if (this.input.consumePausePressed()) {
      this.callbacks.onPauseToggle();
    }

    if (this.input.consumeDebugToggle()) {
      this.debugEnabled = !this.debugEnabled;
    }

    const restartMode = this.input.consumeRestartMode();
    if (restartMode) {
      this.restart(restartMode);
    }

    if (this.callbacks.isPaused() || this.callbacks.isGameOver()) {
      this.emitDebug(dt);
      return;
    }

    this.world.elapsedSeconds += dt;

    for (const system of this.systems) {
      system(dt, this.world);
    }

    this.emitHud();
    this.emitDebug(dt);
  };

  private render = (): void => {
    const now = performance.now();
    const elapsed = now - this.lastRenderAt;
    this.lastRenderAt = now;
    const currentFps = elapsed > 0 ? 1000 / elapsed : 0;
    this.fps = this.fps === 0 ? currentFps : this.fps * 0.9 + currentFps * 0.1;

    this.renderer.render(this.world, this.callbacks.getSettings());
  };

  private movementSystem = (dt: number, world: WorldState): void => {
    const movement = this.input.getMovementVector();
    const dashPressed = this.input.consumeDashPressedEdge();

    world.player.vx += movement.x * PLAYER_ACCEL * dt;
    world.player.vy += movement.y * PLAYER_ACCEL * dt;

    const drag = Math.exp(-FRICTION * dt);
    world.player.vx *= drag;
    world.player.vy *= drag;

    const speed = Math.hypot(world.player.vx, world.player.vy);
    if (speed > MAX_SPEED) {
      const ratio = MAX_SPEED / speed;
      world.player.vx *= ratio;
      world.player.vy *= ratio;
    }

    if (dashPressed) {
      const dashDirection =
        movement.x !== 0 || movement.y !== 0
          ? movement
          : { x: Math.cos(world.player.angle), y: Math.sin(world.player.angle) };
      world.player.vx += dashDirection.x * DASH_IMPULSE;
      world.player.vy += dashDirection.y * DASH_IMPULSE;
    }

    world.player.x += world.player.vx * dt;
    world.player.y += world.player.vy * dt;

    world.player.x = clamp(world.player.x, world.player.radius, world.width - world.player.radius);
    world.player.y = clamp(world.player.y, world.player.radius, world.height - world.player.radius);

    if (Math.hypot(world.player.vx, world.player.vy) > 1) {
      world.player.angle = Math.atan2(world.player.vy, world.player.vx);
    }
  };

  private trailSystem = (dt: number, world: WorldState): void => {
    const lastPoint = world.trail[world.trail.length - 1];
    if (!lastPoint || Math.hypot(lastPoint.x - world.player.x, lastPoint.y - world.player.y) > 3) {
      world.trail.push({ x: world.player.x, y: world.player.y, life: TRAIL_LIFE });
    }

    world.trail = world.trail
      .map((point) => ({ ...point, life: point.life - dt }))
      .filter((point) => point.life > 0)
      .slice(-64);
  };

  private emitHud(): void {
    this.callbacks.onHudChange({
      timeSeconds: this.world.elapsedSeconds,
      level: Math.floor(this.world.elapsedSeconds / 15) + 1,
      hp: this.world.player.hp,
      seed: this.world.seed,
    });
  }

  private emitDebug(dt: number): void {
    this.callbacks.onDebugChange({
      fps: this.fps,
      dtMs: dt * 1000,
      entities: 1,
      seed: this.world.seed,
      paused: this.callbacks.isPaused(),
      enabled: this.debugEnabled,
    });
  }

  private createWorld(): WorldState {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
      elapsedSeconds: 0,
      seed: 0,
      gridOffset: { x: 0, y: 0 },
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        hp: 100,
        radius: 12,
      },
      trail: [],
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type { WorldState };
