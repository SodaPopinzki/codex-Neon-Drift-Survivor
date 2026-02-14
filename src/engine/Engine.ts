import { Renderer } from '../game/renderer';
import type { DebugState, HudState, Settings, VirtualStickInput } from '../types/game';
import { GameLoop } from './gameLoop';
import { InputController, type RestartMode } from './input';
import { createSeed, mulberry32 } from './rng';

type Vec2 = { x: number; y: number };

type TrailPoint = Vec2 & { life: number; intensity: number };

type DashRing = Vec2 & { age: number; life: number; maxRadius: number };

type WorldState = {
  width: number;
  height: number;
  elapsedSeconds: number;
  seed: number;
  gridOffset: Vec2;
  cameraShake: { x: number; y: number; strength: number };
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    hp: number;
    radius: number;
    invulnRemaining: number;
    dashCooldownRemaining: number;
  };
  trail: TrailPoint[];
  dashRings: DashRing[];
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

const PLAYER_ACCEL = 980;
const TURN_BLEND = 9;
const MAX_SPEED = 400;
const LONGITUDINAL_DRAG = 1.9;
const LATERAL_FRICTION = 9.8;
const DRIFT_IDLE_DAMP = 3.8;

const DASH_COOLDOWN = 2.5;
const DASH_INVULN = 0.35;
const DASH_IMPULSE = 560;

const SOFT_BOUND_MARGIN = 96;
const SOFT_BOUND_FORCE = 430;

const TRAIL_LIFE = 0.48;

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
    this.systems = [this.movementSystem, this.trailSystem, this.effectsSystem];

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
      invulnRemaining: 0,
      dashCooldownRemaining: 0,
    };
    this.world.trail = [];
    this.world.dashRings = [];
    this.world.cameraShake = { x: 0, y: 0, strength: 0 };
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

    const currentSpeed = Math.hypot(world.player.vx, world.player.vy);
    const forward =
      currentSpeed > 0.001
        ? { x: world.player.vx / currentSpeed, y: world.player.vy / currentSpeed }
        : { x: Math.cos(world.player.angle), y: Math.sin(world.player.angle) };
    const right = { x: -forward.y, y: forward.x };

    const desiredForward = movement.x * forward.x + movement.y * forward.y;
    const desiredLateral = movement.x * right.x + movement.y * right.y;

    world.player.vx +=
      (forward.x * desiredForward * PLAYER_ACCEL + right.x * desiredLateral * PLAYER_ACCEL * TURN_BLEND) * dt;
    world.player.vy +=
      (forward.y * desiredForward * PLAYER_ACCEL + right.y * desiredLateral * PLAYER_ACCEL * TURN_BLEND) * dt;

    const longSpeed = world.player.vx * forward.x + world.player.vy * forward.y;
    const latSpeed = world.player.vx * right.x + world.player.vy * right.y;

    const longDecay = Math.exp(-LONGITUDINAL_DRAG * dt);
    const latDecay = Math.exp(-(LATERAL_FRICTION + (movement.x === 0 && movement.y === 0 ? DRIFT_IDLE_DAMP : 0)) * dt);

    const nextLong = longSpeed * longDecay;
    const nextLat = latSpeed * latDecay;

    world.player.vx = forward.x * nextLong + right.x * nextLat;
    world.player.vy = forward.y * nextLong + right.y * nextLat;

    world.player.dashCooldownRemaining = Math.max(0, world.player.dashCooldownRemaining - dt);
    world.player.invulnRemaining = Math.max(0, world.player.invulnRemaining - dt);

    if (dashPressed && world.player.dashCooldownRemaining <= 0) {
      const dashDirection =
        movement.x !== 0 || movement.y !== 0
          ? movement
          : { x: Math.cos(world.player.angle), y: Math.sin(world.player.angle) };

      world.player.vx += dashDirection.x * DASH_IMPULSE;
      world.player.vy += dashDirection.y * DASH_IMPULSE;
      world.player.invulnRemaining = DASH_INVULN;
      world.player.dashCooldownRemaining = DASH_COOLDOWN;

      world.dashRings.push({ x: world.player.x, y: world.player.y, age: 0, life: 0.45, maxRadius: 92 });

      if (this.callbacks.getSettings().screenShake) {
        world.cameraShake.strength = Math.max(world.cameraShake.strength, 13);
      }

      for (let i = 0; i < 4; i += 1) {
        world.trail.push({ x: world.player.x, y: world.player.y, life: TRAIL_LIFE * 0.9, intensity: 2.1 - i * 0.22 });
      }
    }

    const speed = Math.hypot(world.player.vx, world.player.vy);
    if (speed > MAX_SPEED) {
      const ratio = MAX_SPEED / speed;
      world.player.vx *= ratio;
      world.player.vy *= ratio;
    }

    const { x: forceX, y: forceY } = getSoftBoundForce(world.player.x, world.player.y, world.width, world.height);
    world.player.vx += forceX * dt;
    world.player.vy += forceY * dt;

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
    const dashBoost = world.player.invulnRemaining > 0 ? 1.5 : 1;
    if (!lastPoint || Math.hypot(lastPoint.x - world.player.x, lastPoint.y - world.player.y) > 3) {
      world.trail.push({ x: world.player.x, y: world.player.y, life: TRAIL_LIFE, intensity: dashBoost });
    }

    world.trail = world.trail
      .map((point) => ({ ...point, life: point.life - dt, intensity: point.intensity * (1 - dt * 0.6) }))
      .filter((point) => point.life > 0)
      .slice(-80);
  };

  private effectsSystem = (dt: number, world: WorldState): void => {
    world.dashRings = world.dashRings
      .map((ring) => ({ ...ring, age: ring.age + dt }))
      .filter((ring) => ring.age < ring.life);

    world.cameraShake.strength = Math.max(0, world.cameraShake.strength - dt * 35);
    if (world.cameraShake.strength <= 0.01) {
      world.cameraShake.x = 0;
      world.cameraShake.y = 0;
      return;
    }

    world.cameraShake.x = (this.random() * 2 - 1) * world.cameraShake.strength;
    world.cameraShake.y = (this.random() * 2 - 1) * world.cameraShake.strength;
  };

  private emitHud(): void {
    this.callbacks.onHudChange({
      timeSeconds: this.world.elapsedSeconds,
      level: Math.floor(this.world.elapsedSeconds / 15) + 1,
      hp: this.world.player.hp,
      seed: this.world.seed,
      dashCooldownRemaining: this.world.player.dashCooldownRemaining,
      dashCooldownTotal: DASH_COOLDOWN,
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
      cameraShake: { x: 0, y: 0, strength: 0 },
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        hp: 100,
        radius: 12,
        invulnRemaining: 0,
        dashCooldownRemaining: 0,
      },
      trail: [],
      dashRings: [],
    };
  }
}

function getSoftBoundForce(x: number, y: number, width: number, height: number): Vec2 {
  let forceX = 0;
  let forceY = 0;

  if (x < SOFT_BOUND_MARGIN) {
    forceX += ((SOFT_BOUND_MARGIN - x) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;
  } else if (x > width - SOFT_BOUND_MARGIN) {
    forceX -= ((x - (width - SOFT_BOUND_MARGIN)) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;
  }

  if (y < SOFT_BOUND_MARGIN) {
    forceY += ((SOFT_BOUND_MARGIN - y) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;
  } else if (y > height - SOFT_BOUND_MARGIN) {
    forceY -= ((y - (height - SOFT_BOUND_MARGIN)) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;
  }

  return { x: forceX, y: forceY };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type { WorldState };
