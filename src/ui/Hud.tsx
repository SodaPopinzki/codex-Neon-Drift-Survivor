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

  const bossHpProgress =
    hud.boss.maxHp > 0 ? Math.max(0, Math.min(1, hud.boss.hp / hud.boss.maxHp)) : 0;

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

      {hud.waveEventLabel ? <div className="wave-event-banner">{hud.waveEventLabel}</div> : null}

      {hud.boss.active ? (
        <div className="boss-health" aria-label="Boss health">
          <div className="boss-health-header">
            <span>{hud.boss.name}</span>
            <span>Phase {hud.boss.phase}</span>
          </div>
          <div className="boss-health-track">
            <div className="boss-health-fill" style={{ transform: `scaleX(${bossHpProgress})` }} />
            {hud.boss.phaseMarkers.map((marker) => (
              <span
                key={marker}
                className="boss-phase-marker"
                style={{ left: `${marker * 100}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

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
