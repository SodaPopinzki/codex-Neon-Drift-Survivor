import type { DebugState, HudState } from '../types/game';

type HudProps = {
  hud: HudState;
  debug: DebugState;
};

export function Hud({ hud, debug }: HudProps) {
  return (
    <>
      <header className="top-bar">
        <span>Time: {hud.timeSeconds.toFixed(1)}s</span>
        <span>Level: {hud.level}</span>
        <span>HP: {hud.hp}</span>
        <span>Seed: {hud.seed}</span>
      </header>

      {debug.enabled ? (
        <aside className="debug-overlay">
          <div>fps: {debug.fps.toFixed(1)}</div>
          <div>dt: {debug.dtMs.toFixed(2)}ms</div>
          <div>entities: {debug.entities}</div>
          <div>seed: {debug.seed}</div>
          <div>paused: {String(debug.paused)}</div>
        </aside>
      ) : null}
    </>
  );
}
