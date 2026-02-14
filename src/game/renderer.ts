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

    this.ctx.fillStyle = settings.highContrast ? '#fff' : PLAYER_COLOR;
    this.ctx.fill();

    if (!settings.highContrast && player.invulnRemaining > 0) {
      this.ctx.strokeStyle = `rgba(255, 120, 220, ${0.5 + player.invulnRemaining})`;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }
}
