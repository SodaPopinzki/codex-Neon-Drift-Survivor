import type { DebugState, HudState } from '../types/game';

type HudProps = {
  hud: HudState;
  debug: DebugState;
};

export function Hud({ hud, debug }: HudProps) {
  const cooldownProgress =
    hud.dashCooldownTotal > 0
      ? 1 - Math.min(1, hud.dashCooldownRemaining / hud.dashCooldownTotal)
      : 1;
  const xpProgress = hud.xpToNext > 0 ? Math.min(1, hud.xp / hud.xpToNext) : 0;

  return (
    <>
      <header className="top-bar">
        <span>Time: {hud.timeSeconds.toFixed(1)}s</span>
        <span>Level: {hud.level}</span>
        <span>HP: {Math.round(hud.hp)}</span>
        <span>Weapon: {hud.weaponName}</span>
        <span>Seed: {hud.seed}</span>
      </header>

      <div className="dash-cooldown" aria-label="Dash cooldown">
        <span>Dash</span>
        <div className="dash-cooldown-track">
          <div
            className="dash-cooldown-fill"
            style={{ transform: `scaleX(${cooldownProgress})` }}
          />
        </div>
      </div>

      <div className="xp-bar" aria-label="XP bar">
        <div className="xp-bar-header">
          <span>XP</span>
          <span>
            {Math.floor(hud.xp)} / {hud.xpToNext}
          </span>
        </div>
        <div className="xp-bar-track">
          <div className="xp-bar-fill" style={{ transform: `scaleX(${xpProgress})` }} />
        </div>
      </div>

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
