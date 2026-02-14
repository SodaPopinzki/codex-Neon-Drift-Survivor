import { useMemo, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { defaultSettings, loadSettings, saveSettings } from './game/settings';
import { Hud } from './ui/Hud';
import { Overlay } from './ui/Overlays';
import { TouchControls } from './ui/TouchControls';
import type { DebugState, HudState, Settings, VirtualStickInput } from './types/game';

const initialHud: HudState = {
  timeSeconds: 0,
  level: 1,
  hp: 100,
  seed: 0,
};

const initialDebug: DebugState = {
  fps: 0,
  dtMs: 0,
  entities: 1,
  seed: 0,
  paused: false,
  enabled: false,
};

export function App() {
  const [hud, setHud] = useState<HudState>(initialHud);
  const [debug, setDebug] = useState<DebugState>(initialDebug);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [restartToken, setRestartToken] = useState(0);
  const [touchMovement, setTouchMovement] = useState<VirtualStickInput>({ x: 0, y: 0, active: false });
  const [touchDash, setTouchDash] = useState(false);

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === 'undefined') return defaultSettings;
    return loadSettings();
  });

  const rootClassName = useMemo(() => {
    return settings.highContrast ? 'app high-contrast' : 'app';
  }, [settings.highContrast]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  const restart = () => {
    setHud(initialHud);
    setPaused(false);
    setGameOver(false);
    setRestartToken((token) => token + 1);
  };

  return (
    <main className={rootClassName}>
      <Hud hud={hud} debug={debug} />

      <div className="settings-row">
        <label>
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.volume}
            onChange={(event) => updateSetting('volume', Number(event.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.screenShake}
            onChange={(event) => updateSetting('screenShake', event.target.checked)}
          />
          Screen shake
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(event) => updateSetting('highContrast', event.target.checked)}
          />
          High contrast
        </label>
      </div>

      <GameCanvas
        paused={paused}
        gameOver={gameOver}
        settings={settings}
        touchMovement={touchMovement}
        touchDash={touchDash}
        onHudChange={(next) => {
          setHud(next);
          if (next.hp <= 0) {
            setGameOver(true);
          }
        }}
        onDebugChange={setDebug}
        onTogglePause={() => setPaused((value) => !value)}
        restartToken={restartToken}
      />

      {paused && !gameOver ? <Overlay title="Paused" subtitle="Press Esc to resume" /> : null}
      {gameOver ? <Overlay title="Game Over" subtitle="Press R to restart with new seed" /> : null}

      <button className="restart-button" type="button" onClick={restart}>
        Restart (R / Shift+R)
      </button>

      <TouchControls
        onMoveChange={setTouchMovement}
        onDashChange={(pressed) => setTouchDash(pressed)}
      />
    </main>
  );
}
