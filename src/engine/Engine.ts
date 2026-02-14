import { Renderer } from '../game/renderer';
import type { DebugState, HudState, Settings, VirtualStickInput } from '../types/game';
import { GameLoop } from './gameLoop';
import { InputController, type RestartMode } from './input';
import { createSeed, mulberry32 } from './rng';

type Vec2 = { x: number; y: number };

type TrailPoint = Vec2 & { life: number; intensity: number };
type DashRing = Vec2 & { age: number; life: number; maxRadius: number };
type EnemyType = 'glider' | 'shard' | 'ram';

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
    radius: number;
    invulnRemaining: number;
    dashCooldownRemaining: number;
    lastMoveDir: Vec2;
  };
  trail: TrailPoint[];
  dashRings: DashRing[];
  enemies: EnemyState[];
  enemyProjectiles: EnemyProjectile[];
  playerProjectiles: PlayerProjectile[];
  scrap: ScrapPickup[];
  hitBursts: HitBurst[];
  damageTexts: DamageText[];
  nextEnemyId: number;
  nextProjectileId: number;
  nextPickupId: number;
  spawnTimer: number;
  playerGraceRemaining: number;
  playerFlashRemaining: number;
  xp: number;
  level: number;
  xpToNext: number;
  weapon: WeaponStats;
  weaponCooldown: number;
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
const PLAYER_HIT_GRACE = 0.5;
const PLAYER_FLASH_DURATION = 0.12;
const SAFE_SPAWN_RADIUS = 230;
const BASE_SPAWN_INTERVAL = 2.2;
const MIN_SPAWN_INTERVAL = 0.55;
const ENEMY_PROJECTILE_SPEED = 150;
const ENEMY_PROJECTILE_LIFE = 7;
const PICKUP_MAGNET_RADIUS = 150;
const SCRAP_LIFE = 18;

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
      this.spawnerSystem,
      this.enemySystem,
      this.autoFireSystem,
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
      lastMoveDir: { x: 0, y: -1 },
    };
    this.world.trail = [];
    this.world.dashRings = [];
    this.world.enemies = [];
    this.world.enemyProjectiles = [];
    this.world.playerProjectiles = [];
    this.world.scrap = [];
    this.world.hitBursts = [];
    this.world.damageTexts = [];
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
    this.world.weapon = { ...STARTING_WEAPON };
    this.world.weaponCooldown = 0;
    this.emitHud();
  }

  private update = (dt: number): void => {
    if (this.input.consumePausePressed()) this.callbacks.onPauseToggle();
    if (this.input.consumeDebugToggle()) this.debugEnabled = !this.debugEnabled;

    const restartMode = this.input.consumeRestartMode();
    if (restartMode) this.restart(restartMode);

    if (this.callbacks.isPaused() || this.callbacks.isGameOver()) {
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

    world.player.vx += forward.x * accelScale * PLAYER_ACCEL * dt;
    world.player.vy += forward.y * accelScale * PLAYER_ACCEL * dt;

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
      world.player.dashCooldownRemaining = DASH_COOLDOWN;
      world.dashRings.push({
        x: world.player.x,
        y: world.player.y,
        age: 0,
        life: 0.45,
        maxRadius: 92,
      });
      if (this.callbacks.getSettings().screenShake)
        world.cameraShake.strength = Math.max(world.cameraShake.strength, 13);
      for (let i = 0; i < 4; i += 1)
        world.trail.push({
          x: world.player.x,
          y: world.player.y,
          life: TRAIL_LIFE * 0.9,
          intensity: 2.1 - i * 0.22,
        });
    }

    const speed = Math.hypot(world.player.vx, world.player.vy);
    if (speed > MAX_SPEED) {
      const ratio = MAX_SPEED / speed;
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

  private spawnerSystem = (dt: number, world: WorldState): void => {
    world.spawnTimer -= dt;
    if (world.spawnTimer > 0) return;

    const danger = Math.min(1, world.elapsedSeconds / 150);
    const spawnCount = world.elapsedSeconds > 70 ? 2 : 1;
    for (let i = 0; i < spawnCount; i += 1) world.enemies.push(this.createEnemy(world, danger));

    const interval = BASE_SPAWN_INTERVAL - (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * danger;
    world.spawnTimer = interval * (0.8 + this.random() * 0.5);
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

      if (enemy.type === 'glider') {
        enemy.wobblePhase += dt * 6;
        const wobble = Math.sin(enemy.wobblePhase) * 0.65;
        enemy.vx = dirX * 120 + -dirY * 70 * wobble;
        enemy.vy = dirY * 120 + dirX * 70 * wobble;
      } else if (enemy.type === 'shard') {
        enemy.fireCooldown -= dt;
        const targetDistance = 245;
        const stretch = distance - targetDistance;
        const approach = clamp(stretch / targetDistance, -1, 1);
        enemy.vx = dirX * approach * 112 + -dirY * 42;
        enemy.vy = dirY * approach * 112 + dirX * 42;

        if (enemy.fireCooldown <= 0 && distance < 500) {
          const lead = 0.5;
          const shot = {
            x: player.x + player.vx * lead - enemy.x,
            y: player.y + player.vy * lead - enemy.y,
          };
          const shotDistance = Math.hypot(shot.x, shot.y) || 1;

          world.enemyProjectiles.push({
            id: world.nextProjectileId++,
            x: enemy.x,
            y: enemy.y,
            vx: (shot.x / shotDistance) * ENEMY_PROJECTILE_SPEED,
            vy: (shot.y / shotDistance) * ENEMY_PROJECTILE_SPEED,
            radius: 6,
            life: ENEMY_PROJECTILE_LIFE,
            maxLife: ENEMY_PROJECTILE_LIFE,
            trail: [],
          });

          enemy.fireCooldown = 1.3 + this.random() * 1.1;
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
          enemy.vx = dirX * 420;
          enemy.vy = dirY * 420;
        } else if (enemy.windupRemaining > 0) {
          enemy.vx *= Math.exp(-dt * 6);
          enemy.vy *= Math.exp(-dt * 6);
        } else {
          enemy.vx = dirX * 95;
          enemy.vy = dirY * 95;
          if (enemy.chargeCooldown <= 0 && distance < 420) {
            enemy.windupRemaining = 0.4;
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

    world.playerProjectiles.push({
      id: world.nextProjectileId++,
      x: world.player.x,
      y: world.player.y,
      vx: dir.x * world.weapon.projectileSpeed,
      vy: dir.y * world.weapon.projectileSpeed,
      radius: 5,
      life: 1.8,
      damage: world.weapon.damage,
      pierceRemaining: world.weapon.pierce,
      chainRemaining: world.weapon.chain,
      critChance: world.weapon.critChance,
      knockback: world.weapon.knockback,
      hitEnemyIds: [],
      trail: [],
    });

    world.weaponCooldown = 1 / world.weapon.fireRate;
  };

  private projectileSystem = (dt: number, world: WorldState): void => {
    world.enemyProjectiles = world.enemyProjectiles
      .map((projectile) => {
        projectile.trail.push({ x: projectile.x, y: projectile.y, life: 0.3, intensity: 0.8 });
        projectile.trail = projectile.trail
          .map((p) => ({ ...p, life: p.life - dt }))
          .filter((p) => p.life > 0)
          .slice(-9);
        return {
          ...projectile,
          x: projectile.x + projectile.vx * dt,
          y: projectile.y + projectile.vy * dt,
          life: projectile.life - dt,
        };
      })
      .filter(
        (projectile) =>
          projectile.life > 0 &&
          projectile.x > -50 &&
          projectile.y > -50 &&
          projectile.x < world.width + 50 &&
          projectile.y < world.height + 50,
      );

    world.playerProjectiles = world.playerProjectiles
      .map((projectile) => {
        projectile.trail.push({ x: projectile.x, y: projectile.y, life: 0.22, intensity: 1 });
        projectile.trail = projectile.trail
          .map((p) => ({ ...p, life: p.life - dt }))
          .filter((p) => p.life > 0)
          .slice(-8);
        return {
          ...projectile,
          x: projectile.x + projectile.vx * dt,
          y: projectile.y + projectile.vy * dt,
          life: projectile.life - dt,
        };
      })
      .filter(
        (projectile) =>
          projectile.life > 0 &&
          projectile.x > -50 &&
          projectile.y > -50 &&
          projectile.x < world.width + 50 &&
          projectile.y < world.height + 50,
      );
  };

  private pickupSystem = (dt: number, world: WorldState): void => {
    const magnet = PICKUP_MAGNET_RADIUS;
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
        while (world.xp >= world.xpToNext) {
          world.xp -= world.xpToNext;
          world.level += 1;
          world.xpToNext = Math.ceil(world.xpToNext * 1.3 + 4);
        }
        return false;
      });
  };

  private combatSystem = (dt: number, world: WorldState): void => {
    const { player } = world;
    world.playerGraceRemaining = Math.max(0, world.playerGraceRemaining - dt);
    world.playerFlashRemaining = Math.max(0, world.playerFlashRemaining - dt);

    for (const enemy of world.enemies) {
      if (enemy.contactCooldown > 0) continue;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      if (Math.hypot(dx, dy) >= player.radius + enemy.radius) continue;

      this.applyPlayerHit(world, enemy.type === 'ram' ? 24 : 14, { x: dx, y: dy });
      enemy.contactCooldown = 0.35;
    }

    world.enemyProjectiles = world.enemyProjectiles.filter((projectile) => {
      const dx = player.x - projectile.x;
      const dy = player.y - projectile.y;
      if (Math.hypot(dx, dy) >= player.radius + projectile.radius) return true;
      this.applyPlayerHit(world, 10, { x: dx, y: dy });
      return false;
    });

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

        if (enemy.hp <= 0) {
          this.spawnScrap(world, enemy);
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

        if (projectile.pierceRemaining > 0) {
          projectile.pierceRemaining -= 1;
        } else {
          projectile.life = 0;
        }

        break;
      }
    }

    world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
    world.playerProjectiles = world.playerProjectiles.filter((projectile) => projectile.life > 0);
  };

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

    if (this.callbacks.getSettings().screenShake)
      world.cameraShake.strength = Math.max(world.cameraShake.strength, 7);
  }

  private effectsSystem = (dt: number, world: WorldState): void => {
    world.dashRings = world.dashRings
      .map((ring) => ({ ...ring, age: ring.age + dt }))
      .filter((ring) => ring.age < ring.life);
    world.hitBursts = world.hitBursts
      .map((burst) => ({ ...burst, age: burst.age + dt }))
      .filter((burst) => burst.age < burst.life);
    world.damageTexts = world.damageTexts
      .map((text) => ({ ...text, age: text.age + dt, y: text.y - dt * 40 }))
      .filter((text) => text.age < text.life);

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
      level: this.world.level,
      hp: this.world.player.hp,
      seed: this.world.seed,
      dashCooldownRemaining: this.world.player.dashCooldownRemaining,
      dashCooldownTotal: DASH_COOLDOWN,
      xp: this.world.xp,
      xpToNext: this.world.xpToNext,
      weaponName: this.world.weapon.name,
    });
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
        this.world.scrap.length,
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
        lastMoveDir: { x: 0, y: -1 },
      },
      trail: [],
      dashRings: [],
      enemies: [],
      enemyProjectiles: [],
      playerProjectiles: [],
      scrap: [],
      hitBursts: [],
      damageTexts: [],
      nextEnemyId: 1,
      nextProjectileId: 1,
      nextPickupId: 1,
      spawnTimer: 1,
      playerGraceRemaining: 0,
      playerFlashRemaining: 0,
      xp: 0,
      level: 1,
      xpToNext: 10,
      weapon: { ...STARTING_WEAPON },
      weaponCooldown: 0,
    };
  }

  private createEnemy(world: WorldState, danger: number): EnemyState {
    const roll = this.random();
    let type: EnemyType;
    if (danger < 0.22) type = 'glider';
    else if (danger < 0.58) type = roll < 0.7 ? 'glider' : 'shard';
    else type = roll < 0.45 ? 'glider' : roll < 0.75 ? 'shard' : 'ram';

    const spawn = this.findSpawnPoint(world);
    const radius = type === 'ram' ? 16 : type === 'shard' ? 13 : 12;
    const hp = type === 'ram' ? 48 : type === 'shard' ? 32 : 22;

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
    };
  }

  private spawnScrap(world: WorldState, enemy: EnemyState): void {
    const drops = enemy.type === 'ram' ? 4 : enemy.type === 'shard' ? 3 : 2;
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
        value: 2,
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
