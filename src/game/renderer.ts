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
    this.drawProjectiles(world, settings);
    this.drawEnemies(world, settings);
    this.drawPlayer(world, settings);
    this.ctx.restore();
  }

  private drawBackground(width: number, height: number, world: WorldState, settings: Settings): void {
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

    if (!settings.highContrast) {
      const vignette = this.ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.2,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7,
      );
      vignette.addColorStop(0, 'rgba(9, 18, 42, 0.0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
      this.ctx.fillStyle = vignette;
      this.ctx.fillRect(0, 0, width, height);
    }
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

    for (const projectile of world.projectiles) {
      for (let i = 1; i < projectile.trail.length; i += 1) {
        const prev = projectile.trail[i - 1];
        const point = projectile.trail[i];
        const alpha = point.life / 0.3;

        this.ctx.lineWidth = 1.6 + point.intensity;
        this.ctx.strokeStyle = settings.highContrast
          ? `rgba(255,255,255,${alpha * 0.8})`
          : `rgba(251, 122, 255, ${alpha * 0.75})`;

        this.ctx.beginPath();
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();
      }
    }
  }

  private drawProjectiles(world: WorldState, settings: Settings): void {
    for (const projectile of world.projectiles) {
      const glow = settings.highContrast ? 'rgba(255,255,255,0.35)' : 'rgba(251, 122, 255, 0.45)';
      this.ctx.shadowBlur = 18;
      this.ctx.shadowColor = glow;
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = settings.highContrast ? '#fff' : '#ff9dff';
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  private drawEnemies(world: WorldState, settings: Settings): void {
    for (const enemy of world.enemies) {
      this.ctx.save();
      this.ctx.translate(enemy.x, enemy.y);

      if (enemy.type === 'glider') {
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

        this.ctx.beginPath();
        this.ctx.moveTo(-enemy.radius * 0.7, -enemy.radius * 0.45);
        this.ctx.lineTo(enemy.radius * 1.2, 0);
        this.ctx.lineTo(-enemy.radius * 0.7, enemy.radius * 0.45);
        this.ctx.closePath();
        this.ctx.fillStyle = settings.highContrast ? '#fff' : '#ffd9a1';
        this.ctx.fill();
      } else {
        const charging = enemy.windupRemaining > 0 || enemy.chargeRemaining > 0;
        this.ctx.strokeStyle = settings.highContrast ? '#fff' : charging ? '#ff4b7a' : '#ff6f43';
        this.ctx.fillStyle = settings.highContrast ? '#000' : charging ? 'rgba(255, 75, 122, 0.3)' : 'rgba(255, 111, 67, 0.25)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.rect(-enemy.radius, -enemy.radius, enemy.radius * 2, enemy.radius * 2);
        this.ctx.fill();
        this.ctx.stroke();

        if (enemy.windupRemaining > 0) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, enemy.radius + 7, 0, Math.PI * 2);
          this.ctx.strokeStyle = settings.highContrast ? '#fff' : 'rgba(255, 75, 122, 0.85)';
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();
        }
      }

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

    if (!settings.highContrast && player.invulnRemaining > 0) {
      this.ctx.strokeStyle = `rgba(255, 120, 220, ${0.5 + player.invulnRemaining})`;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }
}
