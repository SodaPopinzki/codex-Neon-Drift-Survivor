import type { WorldState } from '../engine/Engine';
import type { Settings } from '../types/game';

const BACKGROUND_COLOR = '#040712';
const GRID_COLOR = 'rgba(38, 74, 136, 0.35)';
const PLAYER_COLOR = '#4ef3ff';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  render(world: WorldState, settings: Settings): void {
    const { canvas } = this.ctx;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.ctx.save();
    this.ctx.translate(world.cameraShake.x, world.cameraShake.y);
    this.drawBackground(canvas.width, canvas.height, world, settings);
    this.drawDashRings(world, settings);
    this.drawTrail(world, settings);
    this.drawProjectileTrails(world, settings);
    this.drawScrap(world, settings);
    this.drawMines(world, settings);
    this.drawProjectiles(world, settings);
    this.drawEnemies(world, settings);
    this.drawHitBursts(world, settings);
    this.drawDamageText(world, settings);
    this.drawSawBlades(world, settings);
    this.drawPlayer(world, settings);
    this.ctx.restore();
  }

  private drawBackground(
    width: number,
    height: number,
    world: WorldState,
    settings: Settings,
  ): void {
    this.ctx.fillStyle = settings.highContrast ? '#000' : BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, width, height);
    const step = 56;
    this.ctx.strokeStyle = settings.highContrast ? 'rgba(80, 80, 80, 0.8)' : GRID_COLOR;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();

    for (let x = -step; x < width + step; x += step) {
      const gx = x + world.gridOffset.x;
      this.ctx.moveTo(gx, 0);
      this.ctx.lineTo(gx, height);
    }
    for (let y = -step; y < height + step; y += step) {
      const gy = y + world.gridOffset.y;
      this.ctx.moveTo(0, gy);
      this.ctx.lineTo(width, gy);
    }
    this.ctx.stroke();
  }

  private drawDashRings(world: WorldState, settings: Settings): void {
    for (const ring of world.dashRings) {
      const progress = ring.age / ring.life;
      const alpha = 1 - progress;
      const radius = ring.maxRadius * progress;
      this.ctx.beginPath();
      this.ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = settings.highContrast
        ? `rgba(255,255,255,${alpha})`
        : `rgba(140, 249, 255, ${alpha * 0.9})`;
      this.ctx.stroke();
    }
  }

  private drawTrail(world: WorldState, settings: Settings): void {
    if (world.trail.length < 2) return;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';

    for (let i = 1; i < world.trail.length; i += 1) {
      const prev = world.trail[i - 1];
      const point = world.trail[i];
      const alpha = point.life / 0.48;
      const intensity = Math.max(1, point.intensity);
      this.ctx.lineWidth = 2.4 + intensity * 1.25;
      this.ctx.strokeStyle = settings.highContrast
        ? `rgba(255, 255, 255, ${alpha})`
        : `rgba(78, 243, 255, ${Math.min(1, alpha * (0.75 + intensity * 0.25))})`;
      this.ctx.beginPath();
      this.ctx.moveTo(prev.x, prev.y);
      this.ctx.lineTo(point.x, point.y);
      this.ctx.stroke();
    }
  }

  private drawProjectileTrails(world: WorldState, settings: Settings): void {
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    for (const projectile of world.enemyProjectiles) {
      for (let i = 1; i < projectile.trail.length; i += 1) {
        const prev = projectile.trail[i - 1];
        const point = projectile.trail[i];
        const alpha = point.life / 0.3;
        this.ctx.lineWidth = 1.6 + point.intensity;
        this.ctx.strokeStyle = settings.highContrast
          ? `rgba(255,255,255,${alpha * 0.8})`
          : `rgba(255, 160, 80, ${alpha * 0.75})`;
        this.ctx.beginPath();
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();
      }
    }

    for (const projectile of world.playerProjectiles) {
      for (let i = 1; i < projectile.trail.length; i += 1) {
        const prev = projectile.trail[i - 1];
        const point = projectile.trail[i];
        const alpha = point.life / 0.22;
        this.ctx.lineWidth = 1.9;
        this.ctx.strokeStyle = settings.highContrast
          ? `rgba(255,255,255,${alpha * 0.9})`
          : `rgba(119, 216, 255, ${alpha * 0.9})`;
        this.ctx.beginPath();
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();
      }
    }
  }

  private drawProjectiles(world: WorldState, settings: Settings): void {
    for (const projectile of world.enemyProjectiles) {
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = settings.highContrast ? '#fff' : '#ffa783';
      this.ctx.fill();
    }
    for (const projectile of world.playerProjectiles) {
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = settings.highContrast ? '#fff' : '#8ce7ff';
      this.ctx.fill();
    }
  }

  private drawScrap(world: WorldState, settings: Settings): void {
    for (const pickup of world.scrap) {
      this.ctx.beginPath();
      this.ctx.arc(pickup.x, pickup.y, pickup.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = settings.highContrast ? '#fff' : '#87ff96';
      this.ctx.fill();
    }
  }

  private drawEnemies(world: WorldState, settings: Settings): void {
    for (const enemy of world.enemies) {
      this.ctx.save();
      this.ctx.translate(enemy.x, enemy.y);
      if (enemy.elite) {
        this.ctx.shadowBlur = 14;
        this.ctx.shadowColor = settings.highContrast ? '#fff' : '#9cf8ff';
      }
      if (enemy.type === 'boss') {
        this.ctx.strokeStyle = settings.highContrast ? '#fff' : '#ff5fa2';
        this.ctx.fillStyle = settings.highContrast ? '#000' : 'rgba(255,95,162,0.24)';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, enemy.radius * 0.55, 0, Math.PI * 2);
        this.ctx.stroke();
      } else if (enemy.type === 'glider') {
        this.ctx.strokeStyle = settings.highContrast ? '#fff' : '#80ff7a';
        this.ctx.fillStyle = settings.highContrast ? '#000' : 'rgba(38, 255, 120, 0.22)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -enemy.radius - 3);
        this.ctx.lineTo(enemy.radius + 4, 0);
        this.ctx.lineTo(0, enemy.radius + 3);
        this.ctx.lineTo(-enemy.radius - 4, 0);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
      } else if (enemy.type === 'shard') {
        this.ctx.strokeStyle = settings.highContrast ? '#fff' : '#ffb347';
        this.ctx.fillStyle = settings.highContrast ? '#000' : 'rgba(255, 180, 71, 0.24)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      } else {
        const charging = enemy.windupRemaining > 0 || enemy.chargeRemaining > 0;
        this.ctx.strokeStyle = settings.highContrast ? '#fff' : charging ? '#ff4b7a' : '#ff6f43';
        this.ctx.fillStyle = settings.highContrast
          ? '#000'
          : charging
            ? 'rgba(255, 75, 122, 0.3)'
            : 'rgba(255, 111, 67, 0.25)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.rect(-enemy.radius, -enemy.radius, enemy.radius * 2, enemy.radius * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }

  private drawHitBursts(world: WorldState, settings: Settings): void {
    for (const burst of world.hitBursts) {
      const alpha = 1 - burst.age / burst.life;
      this.ctx.beginPath();
      this.ctx.arc(
        burst.x,
        burst.y,
        burst.radius * (0.25 + burst.age / burst.life),
        0,
        Math.PI * 2,
      );
      this.ctx.strokeStyle = settings.highContrast
        ? `rgba(255,255,255,${alpha})`
        : `rgba(170, 245, 255, ${alpha})`;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  private drawDamageText(world: WorldState, settings: Settings): void {
    for (const text of world.damageTexts) {
      const alpha = 1 - text.age / text.life;
      this.ctx.fillStyle = settings.highContrast
        ? `rgba(255,255,255,${alpha})`
        : text.crit
          ? `rgba(255, 226, 127, ${alpha})`
          : `rgba(232, 246, 255, ${alpha})`;
      this.ctx.font = text.crit ? 'bold 14px Inter, sans-serif' : '12px Inter, sans-serif';
      this.ctx.fillText(`${Math.round(text.value)}`, text.x, text.y);
    }
  }

  private drawMines(world: WorldState, settings: Settings): void {
    for (const mine of world.mines) {
      this.ctx.beginPath();
      this.ctx.arc(mine.x, mine.y, mine.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = settings.highContrast
        ? '#fff'
        : mine.armTime > 0
          ? 'rgba(255,180,130,0.75)'
          : '#ff8a6a';
      this.ctx.fill();
    }
  }

  private drawSawBlades(world: WorldState, settings: Settings): void {
    for (const saw of world.sawBlades) {
      const x = world.player.x + Math.cos(saw.angle) * saw.orbitRadius;
      const y = world.player.y + Math.sin(saw.angle) * saw.orbitRadius;
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(saw.angle * 2);
      this.ctx.beginPath();
      this.ctx.rect(-saw.radius, -3, saw.radius * 2, 6);
      this.ctx.fillStyle = settings.highContrast ? '#fff' : '#ffc25f';
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private drawPlayer(world: WorldState, settings: Settings): void {
    const { player } = world;
    this.ctx.save();
    this.ctx.translate(player.x, player.y);
    this.ctx.rotate(player.angle + Math.PI / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(0, -player.radius);
    this.ctx.lineTo(player.radius * 0.7, player.radius);
    this.ctx.lineTo(-player.radius * 0.7, player.radius);
    this.ctx.closePath();
    const isHitFlash = world.playerFlashRemaining > 0;
    this.ctx.fillStyle = isHitFlash ? '#ff637a' : settings.highContrast ? '#fff' : PLAYER_COLOR;
    this.ctx.fill();
    this.ctx.restore();
  }
}
