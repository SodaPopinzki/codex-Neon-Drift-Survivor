import type { HudState } from '../types/game';

type HudProps = {
  hud: HudState;
};

export function Hud({ hud }: HudProps) {
  return (
    <header className="top-bar">
      <span>Time: {hud.timeSeconds.toFixed(1)}s</span>
      <span>Level: {hud.level}</span>
      <span>HP: {hud.hp}</span>
    </header>
  );
}
