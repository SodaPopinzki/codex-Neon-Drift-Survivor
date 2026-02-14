import type { Settings } from '../types/game';
import { GameState } from './gameState';

const BACKGROUND_COLOR = '#05070e';
const GRID_COLOR = '#12213f';
const PLAYER_COLOR = '#4ef3ff';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly gameState: GameState;

  constructor(ctx: CanvasRenderingContext2D, gameState: GameState) {
    this.ctx = ctx;
    this.gameState = gameState;
  }

  render(settings: Settings): void {
    const { canvas } = this.ctx;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.ctx.fillStyle = settings.highContrast ? '#000000' : BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.drawGrid(canvas.width, canvas.height, settings);

    const player = this.gameState.getPlayer();
    this.ctx.beginPath();
    this.ctx.fillStyle = settings.highContrast ? '#ffffff' : PLAYER_COLOR;
    this.ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawGrid(width: number, height: number, settings: Settings): void {
    const step = 48;
    this.ctx.strokeStyle = settings.highContrast ? '#333333' : GRID_COLOR;
    this.ctx.lineWidth = 1;

    this.ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += step) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    }
    this.ctx.stroke();
  }
}
