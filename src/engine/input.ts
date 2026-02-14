import type { VirtualStickInput } from '../types/game';

type KeyState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: boolean;
  pausePressed: boolean;
  restartPressed: boolean;
};

export class InputController {
  private keyState: KeyState = {
    up: false,
    down: false,
    left: false,
    right: false,
    dash: false,
    pausePressed: false,
    restartPressed: false,
  };

  private touchStick: VirtualStickInput = { x: 0, y: 0, active: false };
  private touchDash = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  setTouchMovement(input: VirtualStickInput): void {
    this.touchStick = input;
  }

  setTouchDash(isPressed: boolean): void {
    this.touchDash = isPressed;
  }

  consumePausePressed(): boolean {
    if (!this.keyState.pausePressed) return false;
    this.keyState.pausePressed = false;
    return true;
  }

  consumeRestartPressed(): boolean {
    if (!this.keyState.restartPressed) return false;
    this.keyState.restartPressed = false;
    return true;
  }

  getMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.keyState.left) x -= 1;
    if (this.keyState.right) x += 1;
    if (this.keyState.up) y -= 1;
    if (this.keyState.down) y += 1;

    if (this.touchStick.active) {
      x += this.touchStick.x;
      y += this.touchStick.y;
    }

    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      return { x: x / magnitude, y: y / magnitude };
    }

    return { x, y };
  }

  isDashPressed(): boolean {
    return this.keyState.dash || this.touchDash;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keyState.up = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keyState.down = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keyState.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keyState.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keyState.dash = true;
        break;
      case 'Escape':
        this.keyState.pausePressed = true;
        break;
      case 'KeyR':
        this.keyState.restartPressed = true;
        break;
      default:
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keyState.up = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keyState.down = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keyState.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keyState.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keyState.dash = false;
        break;
      default:
        break;
    }
  };
}
