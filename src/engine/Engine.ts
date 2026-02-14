import { Renderer } from '../game/renderer';
import type {
  DebugState,
  DraftOption,
  HudState,
  Settings,
  UpgradeInventoryItem,
  VirtualStickInput,
} from '../types/game';
import { GameLoop } from './gameLoop';
import { AudioManager } from './audio';
import { InputController, type RestartMode } from './input';
import { createSeed, mulberry32 } from './rng';

type Vec2 = { x: number; y: number };

type TrailPoint = Vec2 & { life: number; intensity: number };
type DashRing = Vec2 & { age: number; life: number; maxRadius: number };
type EnemyType = 'glider' | 'shard' | 'ram' | 'boss';

type WeaponStats = {
  name: string;
  range: number;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  pierce: number;
  chain: number;
  critChance: number;
  knockback: number;
};

type EnemyState = {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  wobblePhase: number;
  fireCooldown: number;
  chargeCooldown: number;
  windupRemaining: number;
  chargeRemaining: number;
  contactCooldown: number;
  elite: boolean;
  xpValue: number;
  speedMultiplier: number;
  isBoss: boolean;
  phase: number;
  bossAttackCooldown: number;
  bossDashCooldown: number;
  bossSpawnCooldown: number;
};

type EnemyProjectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  trail: TrailPoint[];
};

type PlayerProjectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  damage: number;
  pierceRemaining: number;
  chainRemaining: number;
  critChance: number;
  knockback: number;
  hitEnemyIds: number[];
  trail: TrailPoint[];
};

type OrbitingSaw = {
  id: number;
  angle: number;
  orbitRadius: number;
  radius: number;
  damage: number;
};

type Mine = {
  id: number;
  x: number;
  y: number;
  radius: number;
  armTime: number;
  life: number;
  damage: number;
  blastRadius: number;
};

type ScrapPickup = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  value: number;
  life: number;
};

type HitBurst = Vec2 & { age: number; life: number; radius: number };
type DamageText = Vec2 & { age: number; life: number; value: number; crit: boolean };
type ParticleKind = 'spark' | 'xp' | 'dash' | 'bloom';
type Particle = Vec2 & {
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  kind: ParticleKind;
};

type UpgradeChoice = DraftOption & { apply: (world: WorldState) => void; rarityWeight: number };

export type WorldState = {
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
    maxHp: number;
    radius: number;
    invulnRemaining: number;
    dashCooldownRemaining: number;
    lastMoveDir: Vec2;
    moveSpeedMultiplier: number;
    dashCooldownMultiplier: number;
    pickupMagnetMultiplier: number;
  };
  trail: TrailPoint[];
  dashRings: DashRing[];
  enemies: EnemyState[];
  enemyProjectiles: EnemyProjectile[];
  playerProjectiles: PlayerProjectile[];
  sawBlades: OrbitingSaw[];
  mines: Mine[];
  scrap: ScrapPickup[];
  hitBursts: HitBurst[];
  damageTexts: DamageText[];
  particles: Particle[];
  nextEnemyId: number;
  nextProjectileId: number;
  nextPickupId: number;
  spawnTimer: number;
  playerGraceRemaining: number;
  playerFlashRemaining: number;
  xp: number;
  level: number;
  xpToNext: number;
  enemiesDefeated: number;
  weapon: WeaponStats;
  weaponCooldown: number;
  arcCoilLevel: number;
  sawLevel: number;
  mineLevel: number;
  mineCooldown: number;
  director: {
    spawnRate: number;
    enemySpeed: number;
    enemyHp: number;
    eliteChance: number;
  };
  wave: {
    active: boolean;
    label: string | null;
    enemyOverride: EnemyType | null;
    endsAt: number;
    nextAt: number;
  };
  boss: {
    spawned: boolean;
    defeated: boolean;
    id: number | null;
  };
};

type EngineSystem = (dt: number, world: WorldState) => void;

type EngineCallbacks = {
  onHudChange: (hud: HudState) => void;
  onDebugChange: (debug: DebugState) => void;
  onPauseToggle: () => void;
  onDraftChange: (active: boolean, options: DraftOption[]) => void;
  onInventoryChange: (items: UpgradeInventoryItem[]) => void;
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
const PLAYER_HIT_GRACE = 0.5;
const PLAYER_FLASH_DURATION = 0.12;
const SAFE_SPAWN_RADIUS = 230;
const BASE_SPAWN_INTERVAL = 2.2;
const MIN_SPAWN_INTERVAL = 0.32;
const ENEMY_PROJECTILE_SPEED = 150;
const ENEMY_PROJECTILE_LIFE = 7;
const PICKUP_MAGNET_RADIUS = 150;
const SCRAP_LIFE = 18;
const WAVE_INTERVAL = 90;
const WAVE_DURATION = 20;
const BOSS_TIME = 360;
const MAX_PARTICLES = 800;

const STARTING_WEAPON: WeaponStats = {
  name: 'Pulse Blaster',
  range: 460,
  damage: 12,
  fireRate: 5,
  projectileSpeed: 520,
  pierce: 1,
  chain: 1,
  critChance: 0.18,
  knockback: 140,
};

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
  private draftOptions: UpgradeChoice[] = [];
  private draftActive = false;
  private inventory = new Map<string, UpgradeInventoryItem>();
  private readonly audio = new AudioManager();
  private hitStopRemaining = 0;
  private readonly playerProjectilePool: PlayerProjectile[] = [];
  private readonly enemyProjectilePool: EnemyProjectile[] = [];
  private readonly particlePool: Particle[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    callbacks: EngineCallbacks,
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.input = new InputController();

    this.world = this.createWorld();
    this.restart('new_seed');

    this.renderer = new Renderer(this.ctx);
    this.systems = [
      this.movementSystem,
      this.directorSystem,
      this.spawnerSystem,
      this.enemySystem,
      this.autoFireSystem,
      this.mineSystem,
      this.sawSystem,
      this.projectileSystem,
      this.pickupSystem,
      this.combatSystem,
      this.trailSystem,
      this.effectsSystem,
    ];

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

  chooseDraftOption(index: number): void {
    if (!this.draftActive || index < 0 || index > 2 || !this.draftOptions[index]) return;
    this.draftOptions[index].apply(this.world);
    this.draftActive = false;
    this.draftOptions = [];
    this.callbacks.onDraftChange(false, []);
    this.emitHud();
    this.emitInventory();
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
      maxHp: 100,
      radius: 12,
      invulnRemaining: 0,
      dashCooldownRemaining: 0,
      lastMoveDir: { x: 0, y: -1 },
      moveSpeedMultiplier: 1,
      dashCooldownMultiplier: 1,
      pickupMagnetMultiplier: 1,
    };
    this.world.trail = [];
    this.world.dashRings = [];
    this.world.enemies = [];
    this.world.enemyProjectiles = [];
    this.world.playerProjectiles = [];
    this.world.sawBlades = [];
    this.world.mines = [];
    this.world.scrap = [];
    this.world.hitBursts = [];
    this.world.damageTexts = [];
    this.world.particles = [];
    this.world.nextEnemyId = 1;
    this.world.nextProjectileId = 1;
    this.world.nextPickupId = 1;
    this.world.spawnTimer = 0.8;
    this.world.playerGraceRemaining = 0;
    this.world.playerFlashRemaining = 0;
    this.world.cameraShake = { x: 0, y: 0, strength: 0 };
    this.world.level = 1;
    this.world.xp = 0;
    this.world.xpToNext = 10;
    this.world.enemiesDefeated = 0;
    this.world.weapon = { ...STARTING_WEAPON };
    this.world.weaponCooldown = 0;
    this.world.arcCoilLevel = 0;
    this.world.sawLevel = 0;
    this.world.mineLevel = 0;
    this.world.mineCooldown = 2;
    this.world.director = { spawnRate: 1, enemySpeed: 1, enemyHp: 1, eliteChance: 0.04 };
    this.world.wave = {
      active: false,
      label: null,
      enemyOverride: null,
      endsAt: 0,
      nextAt: WAVE_INTERVAL,
    };
    this.world.boss = { spawned: false, defeated: false, id: null };
    this.hitStopRemaining = 0;
    this.inventory.clear();
    this.draftActive = false;
    this.draftOptions = [];
    this.callbacks.onDraftChange(false, []);
    this.emitHud();
    this.emitInventory();
  }

  private update = (dt: number): void => {
    this.audio.setVolume(this.callbacks.getSettings().volume);
    if (this.input.consumePausePressed()) this.callbacks.onPauseToggle();
    if (this.input.consumeDebugToggle()) this.debugEnabled = !this.debugEnabled;

    const restartMode = this.input.consumeRestartMode();
    if (restartMode) this.restart(restartMode);

    if (this.draftActive) {
      const choice = this.input.consumeDraftChoice();
      if (choice !== null) this.chooseDraftOption(choice);
      this.emitDebug(dt);
      return;
    }

    if (this.callbacks.isPaused() || this.callbacks.isGameOver()) {
      this.hitStopRemaining = 0;
      this.emitDebug(dt);
      return;
    }

    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining = Math.max(0, this.hitStopRemaining - dt);
      this.emitHud();
      this.emitDebug(dt);
      return;
    }

    this.world.elapsedSeconds += dt;
    for (const system of this.systems) system(dt, this.world);

    this.emitHud();
    this.emitDebug(dt);
  };

  private render = (): void => {
    const now = performance.now();
    const frameMs = Math.max(1, now - this.lastRenderAt);
    this.fps = 1000 / frameMs;
    this.lastRenderAt = now;
    this.renderer.render(this.world, this.callbacks.getSettings());
  };

  private movementSystem = (dt: number, world: WorldState): void => {
    const movement = this.input.getMovementVector();
    const dashPressed = this.input.consumeDashPressedEdge();

    const movementLength = Math.hypot(movement.x, movement.y);
    if (movementLength > 0.001) {
      world.player.lastMoveDir = { x: movement.x / movementLength, y: movement.y / movementLength };
    }

    const desiredAngle =
      movementLength > 0.001 ? Math.atan2(movement.y, movement.x) : world.player.angle;
    const angleDiff = normalizeAngle(desiredAngle - world.player.angle);
    world.player.angle += angleDiff * Math.min(1, TURN_BLEND * dt);

    const accelScale = movementLength > 0 ? 1 : 0;
    const forward = { x: Math.cos(world.player.angle), y: Math.sin(world.player.angle) };
    const right = { x: -forward.y, y: forward.x };

    world.player.vx +=
      forward.x * accelScale * PLAYER_ACCEL * world.player.moveSpeedMultiplier * dt;
    world.player.vy +=
      forward.y * accelScale * PLAYER_ACCEL * world.player.moveSpeedMultiplier * dt;

    const longSpeed = world.player.vx * forward.x + world.player.vy * forward.y;
    const latSpeed = world.player.vx * right.x + world.player.vy * right.y;

    const longDecay = Math.exp(-LONGITUDINAL_DRAG * dt);
    const latDecay = Math.exp(
      -(LATERAL_FRICTION + (movement.x === 0 && movement.y === 0 ? DRIFT_IDLE_DAMP : 0)) * dt,
    );
    world.player.vx = forward.x * longSpeed * longDecay + right.x * latSpeed * latDecay;
    world.player.vy = forward.y * longSpeed * longDecay + right.y * latSpeed * latDecay;

    world.player.dashCooldownRemaining = Math.max(0, world.player.dashCooldownRemaining - dt);
    world.player.invulnRemaining = Math.max(0, world.player.invulnRemaining - dt);

    if (dashPressed && world.player.dashCooldownRemaining <= 0) {
      const dashDirection =
        movementLength > 0.001
          ? world.player.lastMoveDir
          : { x: Math.cos(world.player.angle), y: Math.sin(world.player.angle) };
      world.player.vx += dashDirection.x * DASH_IMPULSE;
      world.player.vy += dashDirection.y * DASH_IMPULSE;
      world.player.invulnRemaining = DASH_INVULN;
      world.player.dashCooldownRemaining = DASH_COOLDOWN * world.player.dashCooldownMultiplier;
      world.dashRings.push({
        x: world.player.x,
        y: world.player.y,
        age: 0,
        life: 0.45,
        maxRadius: 92,
      });
      this.audio.play('dash');
      this.spawnParticles(world, world.player.x, world.player.y, 'dash', 14);
      if (this.shouldShake()) world.cameraShake.strength = Math.max(world.cameraShake.strength, 13);
    }

    const speed = Math.hypot(world.player.vx, world.player.vy);
    const maxSpeed = MAX_SPEED * world.player.moveSpeedMultiplier;
    if (speed > maxSpeed) {
      const ratio = maxSpeed / speed;
      world.player.vx *= ratio;
      world.player.vy *= ratio;
    }

    const boundForce = getSoftBoundForce(world.player.x, world.player.y, world.width, world.height);
    world.player.vx += boundForce.x * dt;
    world.player.vy += boundForce.y * dt;

    world.player.x = clamp(
      world.player.x + world.player.vx * dt,
      world.player.radius,
      world.width - world.player.radius,
    );
    world.player.y = clamp(
      world.player.y + world.player.vy * dt,
      world.player.radius,
      world.height - world.player.radius,
    );

    if (Math.hypot(world.player.vx, world.player.vy) > 1)
      world.player.angle = Math.atan2(world.player.vy, world.player.vx);
  };

  private trailSystem = (dt: number, world: WorldState): void => {
    const lastPoint = world.trail[world.trail.length - 1];
    const dashBoost = world.player.invulnRemaining > 0 ? 1.5 : 1;
    if (!lastPoint || Math.hypot(lastPoint.x - world.player.x, lastPoint.y - world.player.y) > 3) {
      world.trail.push({
        x: world.player.x,
        y: world.player.y,
        life: TRAIL_LIFE,
        intensity: dashBoost,
      });
    }

    world.trail = world.trail
      .map((point) => ({
        ...point,
        life: point.life - dt,
        intensity: point.intensity * (1 - dt * 0.6),
      }))
      .filter((point) => point.life > 0)
      .slice(-80);
  };

  private directorSystem = (_dt: number, world: WorldState): void => {
    const t = world.elapsedSeconds;
    const ramp = Math.min(1, t / 420);
    world.director.spawnRate = 1 + ramp * 1.7;
    world.director.enemySpeed = 1 + ramp * 0.8;
    world.director.enemyHp = 1 + ramp * 1.2;
    world.director.eliteChance = Math.min(0.32, 0.04 + ramp * 0.28);

    if (!world.wave.active && t >= world.wave.nextAt) {
      const index = Math.floor(t / WAVE_INTERVAL) % 3;
      world.wave.active = true;
      world.wave.endsAt = t + WAVE_DURATION;
      if (index === 0) {
        world.wave.label = 'Wave Event: Swarm';
        world.wave.enemyOverride = 'glider';
      } else if (index === 1) {
        world.wave.label = 'Wave Event: Snipers';
        world.wave.enemyOverride = 'shard';
      } else {
        world.wave.label = 'Wave Event: Rams';
        world.wave.enemyOverride = 'ram';
      }
      world.wave.nextAt += WAVE_INTERVAL;
    }

    if (world.wave.active && t >= world.wave.endsAt) {
      world.wave.active = false;
      world.wave.label = null;
      world.wave.enemyOverride = null;
    }

    if (!world.boss.spawned && t >= BOSS_TIME) {
      world.boss.spawned = true;
      const boss = this.createBoss(world);
      world.boss.id = boss.id;
      world.enemies.push(boss);
      world.wave.active = true;
      world.wave.label = 'Neon Warden has entered the arena!';
      world.wave.enemyOverride = null;
      world.wave.endsAt = t + 8;
    }
  };

  private spawnerSystem = (dt: number, world: WorldState): void => {
    world.spawnTimer -= dt;
    if (world.spawnTimer > 0) return;

    const danger = Math.min(1, world.elapsedSeconds / 160);
    const bossAlive = world.enemies.some((enemy) => enemy.isBoss && enemy.hp > 0);
    const waveBonus = world.wave.active ? 1 : 0;
    const baseCount = world.elapsedSeconds > 70 ? 2 : 1;
    const spawnCount = bossAlive
      ? 1
      : Math.max(1, Math.floor(baseCount * world.director.spawnRate * 0.6) + waveBonus);

    for (let i = 0; i < spawnCount; i += 1) {
      const forcedType = world.wave.active ? world.wave.enemyOverride : null;
      world.enemies.push(this.createEnemy(world, danger, forcedType));
    }

    const interval =
      (BASE_SPAWN_INTERVAL - (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * danger) /
      world.director.spawnRate;
    world.spawnTimer = Math.max(MIN_SPAWN_INTERVAL, interval) * (0.8 + this.random() * 0.4);
  };

  private enemySystem = (dt: number, world: WorldState): void => {
    const { player } = world;
    for (const enemy of world.enemies) {
      enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
      const toPlayerX = player.x - enemy.x;
      const toPlayerY = player.y - enemy.y;
      const distance = Math.hypot(toPlayerX, toPlayerY) || 1;
      const dirX = toPlayerX / distance;
      const dirY = toPlayerY / distance;
      const speedScale = enemy.speedMultiplier * world.director.enemySpeed;

      if (enemy.type === 'boss') {
        enemy.phase = enemy.hp < enemy.maxHp * 0.33 ? 3 : enemy.hp < enemy.maxHp * 0.66 ? 2 : 1;
        enemy.bossAttackCooldown -= dt;
        enemy.bossDashCooldown -= dt;
        enemy.bossSpawnCooldown -= dt;

        const strafe = Math.sin(world.elapsedSeconds * 1.5) * 0.3;
        enemy.vx = (dirX * 70 - dirY * 90 * strafe) * speedScale;
        enemy.vy = (dirY * 70 + dirX * 90 * strafe) * speedScale;

        if (enemy.bossAttackCooldown <= 0) {
          this.bossSweepAttack(world, enemy);
          enemy.bossAttackCooldown = Math.max(1.4, 2.8 - enemy.phase * 0.45);
        }
        if (enemy.bossDashCooldown <= 0 && distance < 560) {
          enemy.vx = dirX * (500 + enemy.phase * 80);
          enemy.vy = dirY * (500 + enemy.phase * 80);
          enemy.windupRemaining = 0.12;
          enemy.bossDashCooldown = 4.6 - enemy.phase * 0.6;
        }
        if (enemy.bossSpawnCooldown <= 0) {
          const adds = 1 + enemy.phase;
          for (let i = 0; i < adds; i += 1)
            world.enemies.push(this.createEnemy(world, 1, i % 2 === 0 ? 'glider' : 'shard'));
          enemy.bossSpawnCooldown = 8 - enemy.phase;
        }
      } else if (enemy.type === 'glider') {
        enemy.wobblePhase += dt * 6;
        const wobble = Math.sin(enemy.wobblePhase) * 0.65;
        enemy.vx = (dirX * 120 + -dirY * 70 * wobble) * speedScale;
        enemy.vy = (dirY * 120 + dirX * 70 * wobble) * speedScale;
      } else if (enemy.type === 'shard') {
        enemy.fireCooldown -= dt;
        const targetDistance = 245;
        const stretch = distance - targetDistance;
        const approach = clamp(stretch / targetDistance, -1, 1);
        enemy.vx = (dirX * approach * 112 + -dirY * 42) * speedScale;
        enemy.vy = (dirY * approach * 112 + dirX * 42) * speedScale;

        if (enemy.fireCooldown <= 0 && distance < 500) {
          const lead = 0.5;
          const shot = {
            x: player.x + player.vx * lead - enemy.x,
            y: player.y + player.vy * lead - enemy.y,
          };
          const shotDistance = Math.hypot(shot.x, shot.y) || 1;
          world.enemyProjectiles.push(
            this.allocEnemyProjectile({
              id: world.nextProjectileId++,
              x: enemy.x,
              y: enemy.y,
              vx: (shot.x / shotDistance) * ENEMY_PROJECTILE_SPEED,
              vy: (shot.y / shotDistance) * ENEMY_PROJECTILE_SPEED,
              radius: 6,
              life: ENEMY_PROJECTILE_LIFE,
              maxLife: ENEMY_PROJECTILE_LIFE,
            }),
          );
          enemy.fireCooldown = (1.3 + this.random() * 1.1) / speedScale;
        }
      } else {
        enemy.chargeCooldown -= dt;
        const wasWindingUp = enemy.windupRemaining > 0;
        enemy.windupRemaining = Math.max(0, enemy.windupRemaining - dt);
        enemy.chargeRemaining = Math.max(0, enemy.chargeRemaining - dt);
        if (enemy.chargeRemaining > 0) {
          const friction = Math.exp(-dt * 0.65);
          enemy.vx *= friction;
          enemy.vy *= friction;
        } else if (wasWindingUp && enemy.windupRemaining <= 0) {
          enemy.chargeRemaining = 0.42;
          enemy.vx = dirX * 420 * speedScale;
          enemy.vy = dirY * 420 * speedScale;
        } else if (enemy.windupRemaining > 0) {
          enemy.vx *= Math.exp(-dt * 6);
          enemy.vy *= Math.exp(-dt * 6);
        } else {
          enemy.vx = dirX * 95 * speedScale;
          enemy.vy = dirY * 95 * speedScale;
          if (enemy.chargeCooldown <= 0 && distance < 420) {
            enemy.windupRemaining = world.wave.enemyOverride === 'ram' ? 0.75 : 0.4;
            enemy.chargeCooldown = 2.8 + this.random() * 1.2;
          }
        }
      }
      enemy.x = clamp(enemy.x + enemy.vx * dt, enemy.radius, world.width - enemy.radius);
      enemy.y = clamp(enemy.y + enemy.vy * dt, enemy.radius, world.height - enemy.radius);
    }
  };

  private autoFireSystem = (dt: number, world: WorldState): void => {
    world.weaponCooldown = Math.max(0, world.weaponCooldown - dt);
    if (world.weaponCooldown > 0) return;

    const nearest = this.findNearestEnemyInRange(
      world.player.x,
      world.player.y,
      world.weapon.range,
      world.enemies,
    );
    const dir = nearest
      ? normalize({ x: nearest.x - world.player.x, y: nearest.y - world.player.y })
      : world.player.lastMoveDir;
    world.playerProjectiles.push(
      this.allocPlayerProjectile({
        id: world.nextProjectileId++,
        x: world.player.x,
        y: world.player.y,
        vx: dir.x * world.weapon.projectileSpeed,
        vy: dir.y * world.weapon.projectileSpeed,
        radius: 5,
        life: 1.8,
        damage: world.weapon.damage,
        pierceRemaining: world.weapon.pierce,
        chainRemaining: world.weapon.chain + world.arcCoilLevel,
        critChance: world.weapon.critChance,
        knockback: world.weapon.knockback,
      }),
    );

    this.audio.play('shoot');
    world.weaponCooldown = 1 / world.weapon.fireRate;
  };

  private mineSystem = (dt: number, world: WorldState): void => {
    if (world.mineLevel > 0) {
      world.mineCooldown -= dt;
      if (world.mineCooldown <= 0) {
        const cadence = Math.max(0.7, 3 - world.mineLevel * 0.5);
        world.mineCooldown = cadence;
        world.mines.push({
          id: world.nextProjectileId++,
          x: world.player.x,
          y: world.player.y,
          radius: 9,
          armTime: 0.25,
          life: 8,
          damage: 30 + world.mineLevel * 12,
          blastRadius: 90 + world.mineLevel * 18,
        });
      }
    }

    for (let i = world.mines.length - 1; i >= 0; i -= 1) {
      const mine = world.mines[i];
      mine.armTime = Math.max(0, mine.armTime - dt);
      mine.life -= dt;
      if (mine.life <= 0) world.mines.splice(i, 1);
    }
  };

  private sawSystem = (dt: number, world: WorldState): void => {
    if (world.sawLevel <= 0) return;
    const desiredBlades = 2 + world.sawLevel;
    while (world.sawBlades.length < desiredBlades) {
      world.sawBlades.push({
        id: world.nextProjectileId++,
        angle: (Math.PI * 2 * world.sawBlades.length) / desiredBlades,
        orbitRadius: 42 + world.sawLevel * 8,
        radius: 8,
        damage: 10 + world.sawLevel * 4,
      });
    }

    const speed = 2.4 + world.sawLevel * 0.8;
    for (const saw of world.sawBlades) saw.angle += dt * speed;
  };

  private projectileSystem = (dt: number, world: WorldState): void => {
    const clampTrail = (trail: TrailPoint[], maxLen: number): void => {
      for (let i = trail.length - 1; i >= 0; i -= 1) {
        trail[i].life -= dt;
        if (trail[i].life <= 0) trail.splice(i, 1);
      }
      if (trail.length > maxLen) trail.splice(0, trail.length - maxLen);
    };

    for (let i = world.enemyProjectiles.length - 1; i >= 0; i -= 1) {
      const projectile = world.enemyProjectiles[i];
      projectile.trail.push({ x: projectile.x, y: projectile.y, life: 0.3, intensity: 0.8 });
      clampTrail(projectile.trail, 9);
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;
      if (
        projectile.life <= 0 ||
        projectile.x <= -50 ||
        projectile.y <= -50 ||
        projectile.x >= world.width + 50 ||
        projectile.y >= world.height + 50
      ) {
        const [removed] = world.enemyProjectiles.splice(i, 1);
        if (removed) this.enemyProjectilePool.push(removed);
      }
    }

    for (let i = world.playerProjectiles.length - 1; i >= 0; i -= 1) {
      const projectile = world.playerProjectiles[i];
      projectile.trail.push({ x: projectile.x, y: projectile.y, life: 0.22, intensity: 1 });
      clampTrail(projectile.trail, 8);
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;
      if (
        projectile.life <= 0 ||
        projectile.x <= -50 ||
        projectile.y <= -50 ||
        projectile.x >= world.width + 50 ||
        projectile.y >= world.height + 50
      ) {
        const [removed] = world.playerProjectiles.splice(i, 1);
        if (removed) this.playerProjectilePool.push(removed);
      }
    }
  };

  private pickupSystem = (dt: number, world: WorldState): void => {
    const magnet = PICKUP_MAGNET_RADIUS * world.player.pickupMagnetMultiplier;
    world.scrap = world.scrap
      .map((pickup) => {
        const dx = world.player.x - pickup.x;
        const dy = world.player.y - pickup.y;
        const dist = Math.hypot(dx, dy) || 1;
        pickup.vx *= Math.exp(-dt * 5.5);
        pickup.vy *= Math.exp(-dt * 5.5);
        if (dist < magnet) {
          const pull = (1 - dist / magnet) * 620;
          pickup.vx += (dx / dist) * pull * dt;
          pickup.vy += (dy / dist) * pull * dt;
        }
        return {
          ...pickup,
          x: pickup.x + pickup.vx * dt,
          y: pickup.y + pickup.vy * dt,
          life: pickup.life - dt,
        };
      })
      .filter((pickup) => {
        if (pickup.life <= 0) return false;
        const dist = Math.hypot(world.player.x - pickup.x, world.player.y - pickup.y);
        if (dist > world.player.radius + pickup.radius + 2) return true;

        world.xp += pickup.value;
        this.spawnParticles(world, pickup.x, pickup.y, 'xp', 3);
        while (world.xp >= world.xpToNext) {
          world.xp -= world.xpToNext;
          world.level += 1;
          world.xpToNext = Math.ceil(world.xpToNext * 1.3 + 4);
          this.audio.play('levelUp');
          this.startDraft();
        }
        return false;
      });
  };

  private combatSystem = (dt: number, world: WorldState): void => {
    const { player } = world;
    world.playerGraceRemaining = Math.max(0, world.playerGraceRemaining - dt);
    world.playerFlashRemaining = Math.max(0, world.playerFlashRemaining - dt);

    for (const saw of world.sawBlades) {
      const sawX = world.player.x + Math.cos(saw.angle) * saw.orbitRadius;
      const sawY = world.player.y + Math.sin(saw.angle) * saw.orbitRadius;
      for (const enemy of world.enemies) {
        const dx = enemy.x - sawX;
        const dy = enemy.y - sawY;
        if (Math.hypot(dx, dy) > enemy.radius + saw.radius) continue;
        enemy.hp -= saw.damage * dt * 4;
      }
    }

    for (const mine of [...world.mines]) {
      if (mine.armTime > 0) continue;
      const trigger = world.enemies.some(
        (enemy) => Math.hypot(enemy.x - mine.x, enemy.y - mine.y) <= enemy.radius + mine.radius,
      );
      if (!trigger) continue;
      world.mines = world.mines.filter((m) => m.id !== mine.id);
      for (const enemy of world.enemies) {
        const dist = Math.hypot(enemy.x - mine.x, enemy.y - mine.y);
        if (dist > mine.blastRadius) continue;
        enemy.hp -= mine.damage * (1 - (dist / mine.blastRadius) * 0.55);
      }
      world.hitBursts.push({
        x: mine.x,
        y: mine.y,
        age: 0,
        life: 0.26,
        radius: mine.blastRadius * 0.55,
      });
      this.spawnParticles(world, mine.x, mine.y, 'bloom', 28);
    }

    for (const enemy of world.enemies) {
      if (enemy.contactCooldown > 0) continue;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      if (Math.hypot(dx, dy) >= player.radius + enemy.radius) continue;
      this.applyPlayerHit(world, enemy.isBoss ? 28 : enemy.type === 'ram' ? 24 : 14, {
        x: dx,
        y: dy,
      });
      enemy.contactCooldown = 0.35;
    }

    for (let i = world.enemyProjectiles.length - 1; i >= 0; i -= 1) {
      const projectile = world.enemyProjectiles[i];
      const dx = player.x - projectile.x;
      const dy = player.y - projectile.y;
      if (Math.hypot(dx, dy) >= player.radius + projectile.radius) continue;
      this.applyPlayerHit(world, 10, { x: dx, y: dy });
      const [removed] = world.enemyProjectiles.splice(i, 1);
      if (removed) this.enemyProjectilePool.push(removed);
    }

    for (const projectile of world.playerProjectiles) {
      for (const enemy of world.enemies) {
        if (projectile.hitEnemyIds.includes(enemy.id)) continue;
        const dx = enemy.x - projectile.x;
        const dy = enemy.y - projectile.y;
        if (Math.hypot(dx, dy) > enemy.radius + projectile.radius) continue;

        projectile.hitEnemyIds.push(enemy.id);
        const crit = this.random() < projectile.critChance;
        const dealt = projectile.damage * (crit ? 1.8 : 1);
        enemy.hp -= dealt;

        const knock = normalize({ x: dx, y: dy });
        enemy.vx += knock.x * projectile.knockback;
        enemy.vy += knock.y * projectile.knockback;

        world.hitBursts.push({ x: enemy.x, y: enemy.y, age: 0, life: 0.2, radius: 26 });
        this.spawnParticles(world, enemy.x, enemy.y, 'spark', crit ? 12 : 6);
        this.audio.play('hit');
        if (dealt >= world.weapon.damage * 1.7 && this.callbacks.getSettings().hitStop)
          this.hitStopRemaining = Math.max(this.hitStopRemaining, 0.045);
        if (this.callbacks.getSettings().showDamageText) {
          world.damageTexts.push({
            x: enemy.x,
            y: enemy.y - enemy.radius,
            age: 0,
            life: 0.45,
            value: dealt,
            crit,
          });
        }

        if (projectile.chainRemaining > 0) {
          const next = this.findNearestEnemyInRange(
            enemy.x,
            enemy.y,
            170,
            world.enemies.filter(
              (e) => e.id !== enemy.id && !projectile.hitEnemyIds.includes(e.id) && e.hp > 0,
            ),
          );
          if (next) {
            const chainDir = normalize({ x: next.x - enemy.x, y: next.y - enemy.y });
            projectile.vx = chainDir.x * world.weapon.projectileSpeed;
            projectile.vy = chainDir.y * world.weapon.projectileSpeed;
            projectile.chainRemaining -= 1;
          }
        }

        if (projectile.pierceRemaining > 0) projectile.pierceRemaining -= 1;
        else projectile.life = 0;
        break;
      }
    }

    for (const enemy of world.enemies)
      if (enemy.hp <= 0) {
        world.enemiesDefeated += 1;
        if (enemy.isBoss) {
          world.boss.defeated = true;
          world.wave.active = true;
          world.wave.label = 'Neon Warden defeated!';
          world.wave.endsAt = world.elapsedSeconds + 8;
        }
        this.spawnScrap(world, enemy);
      }
    world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
    for (let i = world.playerProjectiles.length - 1; i >= 0; i -= 1) {
      const projectile = world.playerProjectiles[i];
      if (projectile.life > 0) continue;
      const [removed] = world.playerProjectiles.splice(i, 1);
      if (removed) this.playerProjectilePool.push(removed);
    }
  };

  private bossSweepAttack(world: WorldState, boss: EnemyState): void {
    const baseAngle = Math.atan2(world.player.y - boss.y, world.player.x - boss.x);
    const shots = 5 + boss.phase * 2;
    const arc = Math.PI * (0.5 + boss.phase * 0.1);
    for (let i = 0; i < shots; i += 1) {
      const t = shots === 1 ? 0.5 : i / (shots - 1);
      const angle = baseAngle - arc / 2 + arc * t;
      const speed = ENEMY_PROJECTILE_SPEED + 60 + boss.phase * 35;
      world.enemyProjectiles.push(
        this.allocEnemyProjectile({
          id: world.nextProjectileId++,
          x: boss.x,
          y: boss.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 7,
          life: ENEMY_PROJECTILE_LIFE,
          maxLife: ENEMY_PROJECTILE_LIFE,
        }),
      );
    }
  }

  private applyPlayerHit(world: WorldState, rawDamage: number, sourceDelta: Vec2): void {
    if (world.player.invulnRemaining > 0 || world.player.hp <= 0) return;
    const graceScale = world.playerGraceRemaining > 0 ? 0.35 : 1;
    const damage = rawDamage * graceScale;
    world.player.hp = Math.max(0, world.player.hp - damage);
    world.playerGraceRemaining = PLAYER_HIT_GRACE;
    world.playerFlashRemaining = PLAYER_FLASH_DURATION;
    const length = Math.hypot(sourceDelta.x, sourceDelta.y) || 1;
    world.player.vx += (sourceDelta.x / length) * 180;
    world.player.vy += (sourceDelta.y / length) * 180;
    if (this.shouldShake()) world.cameraShake.strength = Math.max(world.cameraShake.strength, 7);
  }

  private effectsSystem = (dt: number, world: WorldState): void => {
    for (let i = world.dashRings.length - 1; i >= 0; i -= 1) {
      const ring = world.dashRings[i];
      ring.age += dt;
      if (ring.age >= ring.life) world.dashRings.splice(i, 1);
    }
    for (let i = world.hitBursts.length - 1; i >= 0; i -= 1) {
      const burst = world.hitBursts[i];
      burst.age += dt;
      if (burst.age >= burst.life) world.hitBursts.splice(i, 1);
    }
    for (let i = world.damageTexts.length - 1; i >= 0; i -= 1) {
      const text = world.damageTexts[i];
      text.age += dt;
      text.y -= dt * 40;
      if (text.age >= text.life) world.damageTexts.splice(i, 1);
    }
    const reduceMotion = this.callbacks.getSettings().reduceMotion;
    for (let i = world.particles.length - 1; i >= 0; i -= 1) {
      const particle = world.particles[i];
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      if (particle.age >= particle.life) {
        const [removed] = world.particles.splice(i, 1);
        if (removed) this.particlePool.push(removed);
      }
    }

    world.cameraShake.strength = Math.max(0, world.cameraShake.strength - dt * 35);
    if (world.cameraShake.strength <= 0.01 || reduceMotion) {
      world.cameraShake.x = 0;
      world.cameraShake.y = 0;
      return;
    }
    world.cameraShake.x = (this.random() * 2 - 1) * world.cameraShake.strength;
    world.cameraShake.y = (this.random() * 2 - 1) * world.cameraShake.strength;
  };

  private shouldShake(): boolean {
    const settings = this.callbacks.getSettings();
    return settings.screenShake && !settings.reduceMotion;
  }

  private spawnParticles(
    world: WorldState,
    x: number,
    y: number,
    kind: ParticleKind,
    count: number,
  ): void {
    if (this.callbacks.getSettings().reduceMotion) count = Math.ceil(count * 0.35);
    for (let i = 0; i < count; i += 1) {
      if (world.particles.length >= MAX_PARTICLES) return;
      const angle = this.random() * Math.PI * 2;
      const speed = kind === 'bloom' ? 180 + this.random() * 160 : 35 + this.random() * 180;
      world.particles.push(
        this.allocParticle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: kind === 'xp' ? 0.45 : kind === 'bloom' ? 0.32 : 0.24,
          size: kind === 'bloom' ? 4 + this.random() * 4 : 1.5 + this.random() * 2.5,
          kind,
        }),
      );
    }
  }

  private startDraft(): void {
    const options = this.rollDraftChoices();
    this.draftOptions = options;
    this.draftActive = true;
    this.callbacks.onDraftChange(
      true,
      options.map((choice) => ({
        id: choice.id,
        title: choice.title,
        description: choice.description,
        rarity: choice.rarity,
        icon: choice.icon,
      })),
    );
  }

  private rollDraftChoices(): UpgradeChoice[] {
    const pool = this.createUpgradePool();
    const picked: UpgradeChoice[] = [];
    while (picked.length < 3 && pool.length > 0) {
      const totalWeight = pool.reduce((sum, item) => sum + item.rarityWeight, 0);
      let roll = this.random() * totalWeight;
      let index = 0;
      for (; index < pool.length; index += 1) {
        roll -= pool[index].rarityWeight;
        if (roll <= 0) break;
      }
      picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
    }
    return picked;
  }

  private createUpgradePool(): UpgradeChoice[] {
    const world = this.world;
    const add = (choice: Omit<UpgradeChoice, 'rarityWeight'>) => ({
      ...choice,
      rarityWeight: choice.rarity === 'common' ? 70 : choice.rarity === 'rare' ? 22 : 8,
    });
    const pool: UpgradeChoice[] = [
      add({
        id: 'damage-10',
        title: 'Damage +10%',
        description: 'Pulse damage increased by 10%.',
        rarity: 'common',
        icon: '💥',
        apply: (w) => this.applyWeaponScale(w, 'damage', 1.1),
      }),
      add({
        id: 'damage-15',
        title: 'Damage +15%',
        description: 'Pulse damage increased by 15%.',
        rarity: 'rare',
        icon: '💥',
        apply: (w) => this.applyWeaponScale(w, 'damage', 1.15),
      }),
      add({
        id: 'damage-20',
        title: 'Damage +20%',
        description: 'Pulse damage increased by 20%.',
        rarity: 'epic',
        icon: '💥',
        apply: (w) => this.applyWeaponScale(w, 'damage', 1.2),
      }),
      add({
        id: 'fire-10',
        title: 'Fire Rate +10%',
        description: 'Shoot faster.',
        rarity: 'common',
        icon: '⚡',
        apply: (w) => this.applyWeaponScale(w, 'fireRate', 1.1),
      }),
      add({
        id: 'fire-15',
        title: 'Fire Rate +15%',
        description: 'Shoot much faster.',
        rarity: 'rare',
        icon: '⚡',
        apply: (w) => this.applyWeaponScale(w, 'fireRate', 1.15),
      }),
      add({
        id: 'fire-20',
        title: 'Fire Rate +20%',
        description: 'Relentless fire cadence.',
        rarity: 'epic',
        icon: '⚡',
        apply: (w) => this.applyWeaponScale(w, 'fireRate', 1.2),
      }),
      add({
        id: 'range-10',
        title: 'Range +10%',
        description: 'Pulse range increased.',
        rarity: 'common',
        icon: '🎯',
        apply: (w) => this.applyWeaponScale(w, 'range', 1.1),
      }),
      add({
        id: 'range-15',
        title: 'Range +15%',
        description: 'Pulse range increased.',
        rarity: 'rare',
        icon: '🎯',
        apply: (w) => this.applyWeaponScale(w, 'range', 1.15),
      }),
      add({
        id: 'range-20',
        title: 'Range +20%',
        description: 'Pulse range increased.',
        rarity: 'epic',
        icon: '🎯',
        apply: (w) => this.applyWeaponScale(w, 'range', 1.2),
      }),
      add({
        id: 'move-8',
        title: 'Move Speed +8%',
        description: 'Thrusters gain momentum.',
        rarity: 'common',
        icon: '👟',
        apply: (w) => this.applyPlayerScale(w, 'moveSpeedMultiplier', 1.08),
      }),
      add({
        id: 'move-12',
        title: 'Move Speed +12%',
        description: 'Cruise faster.',
        rarity: 'rare',
        icon: '👟',
        apply: (w) => this.applyPlayerScale(w, 'moveSpeedMultiplier', 1.12),
      }),
      add({
        id: 'move-16',
        title: 'Move Speed +16%',
        description: 'Extreme mobility.',
        rarity: 'epic',
        icon: '👟',
        apply: (w) => this.applyPlayerScale(w, 'moveSpeedMultiplier', 1.16),
      }),
      add({
        id: 'dash-10',
        title: 'Dash Cooldown -10%',
        description: 'Dash ready sooner.',
        rarity: 'common',
        icon: '💨',
        apply: (w) => this.applyPlayerScale(w, 'dashCooldownMultiplier', 0.9),
      }),
      add({
        id: 'dash-15',
        title: 'Dash Cooldown -15%',
        description: 'Dash ready much sooner.',
        rarity: 'rare',
        icon: '💨',
        apply: (w) => this.applyPlayerScale(w, 'dashCooldownMultiplier', 0.85),
      }),
      add({
        id: 'dash-20',
        title: 'Dash Cooldown -20%',
        description: 'Dash almost always ready.',
        rarity: 'epic',
        icon: '💨',
        apply: (w) => this.applyPlayerScale(w, 'dashCooldownMultiplier', 0.8),
      }),
      add({
        id: 'hp-15',
        title: 'Max HP +15',
        description: 'Increase survivability.',
        rarity: 'common',
        icon: '❤️',
        apply: (w) => this.increaseMaxHp(w, 15),
      }),
      add({
        id: 'hp-25',
        title: 'Max HP +25',
        description: 'Increase survivability.',
        rarity: 'rare',
        icon: '❤️',
        apply: (w) => this.increaseMaxHp(w, 25),
      }),
      add({
        id: 'hp-40',
        title: 'Max HP +40',
        description: 'Increase survivability.',
        rarity: 'epic',
        icon: '❤️',
        apply: (w) => this.increaseMaxHp(w, 40),
      }),
      add({
        id: 'magnet-20',
        title: 'Pickup Magnet +20%',
        description: 'Pull scrap from farther.',
        rarity: 'common',
        icon: '🧲',
        apply: (w) => this.applyPlayerScale(w, 'pickupMagnetMultiplier', 1.2),
      }),
      add({
        id: 'magnet-35',
        title: 'Pickup Magnet +35%',
        description: 'Pull scrap from farther.',
        rarity: 'rare',
        icon: '🧲',
        apply: (w) => this.applyPlayerScale(w, 'pickupMagnetMultiplier', 1.35),
      }),
      add({
        id: 'magnet-50',
        title: 'Pickup Magnet +50%',
        description: 'Massive scrap pull.',
        rarity: 'epic',
        icon: '🧲',
        apply: (w) => this.applyPlayerScale(w, 'pickupMagnetMultiplier', 1.5),
      }),
    ];

    if (world.arcCoilLevel === 0)
      pool.push(
        add({
          id: 'unlock-arc',
          title: 'Unlock Arc Coil',
          description: 'Shots chain to 2 additional enemies.',
          rarity: 'rare',
          icon: '🌀',
          apply: (w) => {
            w.arcCoilLevel = 1;
            this.recordUpgrade('unlock-arc', '🌀 Arc Coil', '🌀');
          },
        }),
      );
    else
      pool.push(
        add({
          id: 'up-arc',
          title: 'Arc Coil +1 chain',
          description: 'Chain one more target.',
          rarity: 'epic',
          icon: '🌀',
          apply: (w) => {
            w.arcCoilLevel += 1;
            this.recordUpgrade('up-arc', '🌀 Arc Coil +1', '🌀');
          },
        }),
      );

    if (world.sawLevel === 0)
      pool.push(
        add({
          id: 'unlock-saw',
          title: 'Unlock Shredder Saw',
          description: 'Orbiting blades shred nearby enemies.',
          rarity: 'rare',
          icon: '🪚',
          apply: (w) => {
            w.sawLevel = 1;
            this.recordUpgrade('unlock-saw', '🪚 Shredder Saw', '🪚');
          },
        }),
      );
    else
      pool.push(
        add({
          id: 'up-saw',
          title: 'Shredder Saw Upgrade',
          description: 'More blades and damage.',
          rarity: 'epic',
          icon: '🪚',
          apply: (w) => {
            w.sawLevel += 1;
            this.recordUpgrade('up-saw', '🪚 Shredder Saw+', '🪚');
          },
        }),
      );

    if (world.mineLevel === 0)
      pool.push(
        add({
          id: 'unlock-mine',
          title: 'Unlock Nova Mine',
          description: 'Drop mines that explode on contact.',
          rarity: 'rare',
          icon: '💣',
          apply: (w) => {
            w.mineLevel = 1;
            this.recordUpgrade('unlock-mine', '💣 Nova Mine', '💣');
          },
        }),
      );
    else
      pool.push(
        add({
          id: 'up-mine',
          title: 'Nova Mine Upgrade',
          description: 'Faster drops and stronger blasts.',
          rarity: 'epic',
          icon: '💣',
          apply: (w) => {
            w.mineLevel += 1;
            this.recordUpgrade('up-mine', '💣 Nova Mine+', '💣');
          },
        }),
      );

    return pool;
  }

  private applyWeaponScale(
    world: WorldState,
    key: 'damage' | 'fireRate' | 'range',
    scale: number,
  ): void {
    world.weapon[key] *= scale;
    this.recordUpgrade(
      `${key}-${scale}`,
      `${key} x${scale.toFixed(2)}`,
      key === 'damage' ? '💥' : key === 'fireRate' ? '⚡' : '🎯',
    );
  }

  private applyPlayerScale(
    world: WorldState,
    key: 'moveSpeedMultiplier' | 'dashCooldownMultiplier' | 'pickupMagnetMultiplier',
    scale: number,
  ): void {
    world.player[key] *= scale;
    const icon =
      key === 'moveSpeedMultiplier' ? '👟' : key === 'dashCooldownMultiplier' ? '💨' : '🧲';
    this.recordUpgrade(`${key}-${scale}`, `${key} x${scale.toFixed(2)}`, icon);
  }

  private increaseMaxHp(world: WorldState, amount: number): void {
    world.player.maxHp += amount;
    world.player.hp += amount;
    this.recordUpgrade(`hp-${amount}`, `Max HP +${amount}`, '❤️');
  }

  private recordUpgrade(id: string, label: string, icon: string): void {
    const existing = this.inventory.get(id);
    if (existing) existing.stacks += 1;
    else this.inventory.set(id, { id, icon, label, stacks: 1 });
  }

  private emitHud(): void {
    const boss = this.world.enemies.find((enemy) => enemy.isBoss);
    this.callbacks.onHudChange({
      timeSeconds: this.world.elapsedSeconds,
      level: this.world.level,
      hp: this.world.player.hp,
      seed: this.world.seed,
      enemiesDefeated: this.world.enemiesDefeated,
      dashCooldownRemaining: this.world.player.dashCooldownRemaining,
      dashCooldownTotal: DASH_COOLDOWN * this.world.player.dashCooldownMultiplier,
      xp: this.world.xp,
      xpToNext: this.world.xpToNext,
      weaponName: this.world.weapon.name,
      waveEventLabel: this.world.wave.active ? this.world.wave.label : null,
      boss: {
        active: Boolean(boss),
        name: 'Neon Warden',
        hp: boss?.hp ?? 0,
        maxHp: boss?.maxHp ?? 0,
        phase: boss?.phase ?? 1,
        phaseMarkers: [0.66, 0.33],
      },
    });
  }

  private emitInventory(): void {
    this.callbacks.onInventoryChange([...this.inventory.values()]);
  }

  private emitDebug(dt: number): void {
    this.callbacks.onDebugChange({
      fps: this.fps,
      dtMs: dt * 1000,
      entities:
        1 +
        this.world.enemies.length +
        this.world.enemyProjectiles.length +
        this.world.playerProjectiles.length +
        this.world.scrap.length +
        this.world.mines.length,
      seed: this.world.seed,
      paused: this.callbacks.isPaused() || this.draftActive,
      enabled: this.debugEnabled,
    });
  }

  private allocPlayerProjectile(
    base: Omit<PlayerProjectile, 'trail' | 'hitEnemyIds'>,
  ): PlayerProjectile {
    const item = this.playerProjectilePool.pop();
    if (item) {
      item.id = base.id;
      item.x = base.x;
      item.y = base.y;
      item.vx = base.vx;
      item.vy = base.vy;
      item.radius = base.radius;
      item.life = base.life;
      item.damage = base.damage;
      item.pierceRemaining = base.pierceRemaining;
      item.chainRemaining = base.chainRemaining;
      item.critChance = base.critChance;
      item.knockback = base.knockback;
      item.trail.length = 0;
      item.hitEnemyIds.length = 0;
      return item;
    }
    return { ...base, trail: [], hitEnemyIds: [] };
  }

  private allocEnemyProjectile(base: Omit<EnemyProjectile, 'trail'>): EnemyProjectile {
    const item = this.enemyProjectilePool.pop();
    if (item) {
      Object.assign(item, base);
      item.trail.length = 0;
      return item;
    }
    return { ...base, trail: [] };
  }

  private allocParticle(base: Omit<Particle, 'age'>): Particle {
    const item = this.particlePool.pop();
    if (item) {
      Object.assign(item, base);
      item.age = 0;
      return item;
    }
    return { ...base, age: 0 };
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
        maxHp: 100,
        radius: 12,
        invulnRemaining: 0,
        dashCooldownRemaining: 0,
        lastMoveDir: { x: 0, y: -1 },
        moveSpeedMultiplier: 1,
        dashCooldownMultiplier: 1,
        pickupMagnetMultiplier: 1,
      },
      trail: [],
      dashRings: [],
      enemies: [],
      enemyProjectiles: [],
      playerProjectiles: [],
      sawBlades: [],
      mines: [],
      scrap: [],
      hitBursts: [],
      damageTexts: [],
      particles: [],
      nextEnemyId: 1,
      nextProjectileId: 1,
      nextPickupId: 1,
      spawnTimer: 1,
      playerGraceRemaining: 0,
      playerFlashRemaining: 0,
      xp: 0,
      level: 1,
      xpToNext: 10,
      enemiesDefeated: 0,
      weapon: { ...STARTING_WEAPON },
      weaponCooldown: 0,
      arcCoilLevel: 0,
      sawLevel: 0,
      mineLevel: 0,
      mineCooldown: 2,
      director: { spawnRate: 1, enemySpeed: 1, enemyHp: 1, eliteChance: 0.04 },
      wave: { active: false, label: null, enemyOverride: null, endsAt: 0, nextAt: WAVE_INTERVAL },
      boss: { spawned: false, defeated: false, id: null },
    };
  }

  private createEnemy(
    world: WorldState,
    danger: number,
    forcedType: EnemyType | null = null,
  ): EnemyState {
    const roll = this.random();
    let type: EnemyType;
    if (forcedType) type = forcedType;
    else if (danger < 0.22) type = 'glider';
    else if (danger < 0.58) type = roll < 0.7 ? 'glider' : 'shard';
    else type = roll < 0.45 ? 'glider' : roll < 0.75 ? 'shard' : 'ram';

    const spawn = this.findSpawnPoint(world);
    const baseRadius = type === 'ram' ? 16 : type === 'shard' ? 13 : 12;
    const baseHp = type === 'ram' ? 48 : type === 'shard' ? 32 : 22;
    const elite = type !== 'boss' && this.random() < world.director.eliteChance;
    const radius = elite ? baseRadius * 1.5 : baseRadius;
    const hp = baseHp * world.director.enemyHp * (elite ? 2 : 1);

    return {
      id: world.nextEnemyId++,
      type,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      radius,
      hp,
      maxHp: hp,
      wobblePhase: this.random() * Math.PI * 2,
      fireCooldown: 1 + this.random() * 1.5,
      chargeCooldown: 1.3 + this.random() * 1.2,
      windupRemaining: 0,
      chargeRemaining: 0,
      contactCooldown: 0,
      elite,
      xpValue: elite ? 5 : 2,
      speedMultiplier: elite ? 1.18 : 1,
      isBoss: false,
      phase: 1,
      bossAttackCooldown: 0,
      bossDashCooldown: 0,
      bossSpawnCooldown: 0,
    };
  }

  private createBoss(world: WorldState): EnemyState {
    const spawn = this.findSpawnPoint(world);
    const hp = 3200;
    return {
      id: world.nextEnemyId++,
      type: 'boss',
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      radius: 42,
      hp,
      maxHp: hp,
      wobblePhase: 0,
      fireCooldown: 0,
      chargeCooldown: 0,
      windupRemaining: 0,
      chargeRemaining: 0,
      contactCooldown: 0,
      elite: false,
      xpValue: 24,
      speedMultiplier: 1,
      isBoss: true,
      phase: 1,
      bossAttackCooldown: 1.5,
      bossDashCooldown: 3,
      bossSpawnCooldown: 6,
    };
  }

  private spawnScrap(world: WorldState, enemy: EnemyState): void {
    const drops = enemy.isBoss ? 28 : enemy.type === 'ram' ? 4 : enemy.type === 'shard' ? 3 : 2;
    const scrapValue = enemy.isBoss ? 6 : enemy.xpValue;
    for (let i = 0; i < drops; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = 60 + this.random() * 60;
      world.scrap.push({
        id: world.nextPickupId++,
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5,
        value: scrapValue,
        life: SCRAP_LIFE,
      });
    }
  }

  private findNearestEnemyInRange(
    x: number,
    y: number,
    range: number,
    enemies: EnemyState[],
  ): EnemyState | null {
    const rangeSq = range * range;
    let nearest: EnemyState | null = null;
    let nearestDistSq = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq || distSq >= nearestDistSq) continue;
      nearest = enemy;
      nearestDistSq = distSq;
    }
    return nearest;
  }

  private findSpawnPoint(world: WorldState): Vec2 {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const edge = Math.floor(this.random() * 4);
      const margin = 30;
      let x = 0;
      let y = 0;
      if (edge === 0) {
        x = -margin;
        y = this.random() * world.height;
      } else if (edge === 1) {
        x = world.width + margin;
        y = this.random() * world.height;
      } else if (edge === 2) {
        x = this.random() * world.width;
        y = -margin;
      } else {
        x = this.random() * world.width;
        y = world.height + margin;
      }

      if (Math.hypot(x - world.player.x, y - world.player.y) >= SAFE_SPAWN_RADIUS) {
        return { x: clamp(x, 10, world.width - 10), y: clamp(y, 10, world.height - 10) };
      }
    }

    const angle = this.random() * Math.PI * 2;
    return {
      x: clamp(world.player.x + Math.cos(angle) * SAFE_SPAWN_RADIUS, 10, world.width - 10),
      y: clamp(world.player.y + Math.sin(angle) * SAFE_SPAWN_RADIUS, 10, world.height - 10),
    };
  }
}

function getSoftBoundForce(x: number, y: number, width: number, height: number): Vec2 {
  let forceX = 0;
  let forceY = 0;

  if (x < SOFT_BOUND_MARGIN)
    forceX += ((SOFT_BOUND_MARGIN - x) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;
  else if (x > width - SOFT_BOUND_MARGIN)
    forceX -= ((x - (width - SOFT_BOUND_MARGIN)) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;

  if (y < SOFT_BOUND_MARGIN)
    forceY += ((SOFT_BOUND_MARGIN - y) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;
  else if (y > height - SOFT_BOUND_MARGIN)
    forceY -= ((y - (height - SOFT_BOUND_MARGIN)) / SOFT_BOUND_MARGIN) * SOFT_BOUND_FORCE;

  return { x: forceX, y: forceY };
}

function normalize(vec: Vec2): Vec2 {
  const len = Math.hypot(vec.x, vec.y) || 1;
  return { x: vec.x / len, y: vec.y / len };
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
