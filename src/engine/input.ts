import type { VirtualStickInput } from '../types/game';

export type RestartMode = 'same_seed' | 'new_seed';

type KeyState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: boolean;
  pausePressed: boolean;
  restartMode: RestartMode | null;
  debugPressed: boolean;
  draftChoice: 0 | 1 | 2 | null;
};

export class InputController {
  private keyState: KeyState = {
    up: false,
    down: false,
    left: false,
    right: false,
    dash: false,
    pausePressed: false,
    restartMode: null,
    debugPressed: false,
    draftChoice: null,
  };

  private touchStick: VirtualStickInput = { x: 0, y: 0, active: false };
  private touchDash = false;
  private dashWasPressed = false;

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

  consumeRestartMode(): RestartMode | null {
    const mode = this.keyState.restartMode;
    this.keyState.restartMode = null;
    return mode;
  }

  consumeDebugToggle(): boolean {
    if (!this.keyState.debugPressed) return false;
    this.keyState.debugPressed = false;
    return true;
  }

  consumeDraftChoice(): 0 | 1 | 2 | null {
    const choice = this.keyState.draftChoice;
    this.keyState.draftChoice = null;
    return choice;
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

  consumeDashPressedEdge(): boolean {
    const isPressed = this.keyState.dash || this.touchDash;
    const didPress = isPressed && !this.dashWasPressed;
    this.dashWasPressed = isPressed;
    return didPress;
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
        this.keyState.restartMode = event.shiftKey ? 'same_seed' : 'new_seed';
        break;
      case 'Backquote':
        this.keyState.debugPressed = true;
        break;
      case 'Digit1':
        this.keyState.draftChoice = 0;
        break;
      case 'Digit2':
        this.keyState.draftChoice = 1;
        break;
      case 'Digit3':
        this.keyState.draftChoice = 2;
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
