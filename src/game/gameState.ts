import type { HudState } from '../types/game';

const PLAYER_RADIUS = 12;
const PLAYER_SPEED = 260;
const DASH_SPEED = 450;

export class GameState {
  private width = 0;
  private height = 0;
  private readonly player = { x: 0, y: 0, hp: 100 };
  private elapsedSeconds = 0;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.player.x === 0 && this.player.y === 0) {
      this.player.x = width * 0.5;
      this.player.y = height * 0.5;
      return;
    }

    this.player.x = clamp(this.player.x, PLAYER_RADIUS, width - PLAYER_RADIUS);
    this.player.y = clamp(this.player.y, PLAYER_RADIUS, height - PLAYER_RADIUS);
  }

  reset(): void {
    this.player.x = this.width * 0.5;
    this.player.y = this.height * 0.5;
    this.player.hp = 100;
    this.elapsedSeconds = 0;
  }

  update(dt: number, movement: { x: number; y: number }, dashPressed: boolean): void {
    this.elapsedSeconds += dt;

    const speed = dashPressed ? DASH_SPEED : PLAYER_SPEED;
    this.player.x += movement.x * speed * dt;
    this.player.y += movement.y * speed * dt;

    this.player.x = clamp(this.player.x, PLAYER_RADIUS, this.width - PLAYER_RADIUS);
    this.player.y = clamp(this.player.y, PLAYER_RADIUS, this.height - PLAYER_RADIUS);
  }

  getHudState(): HudState {
    return {
      timeSeconds: this.elapsedSeconds,
      level: Math.floor(this.elapsedSeconds / 15) + 1,
      hp: this.player.hp,
      seed: 0,
    };
  }

  getPlayer(): { x: number; y: number; radius: number } {
    return { x: this.player.x, y: this.player.y, radius: PLAYER_RADIUS };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
