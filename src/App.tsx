import { useMemo, useState } from 'react';
import type { Engine } from './engine/Engine';
import { GameCanvas } from './game/GameCanvas';
import { defaultSettings, loadSettings, saveSettings } from './game/settings';
import { Hud } from './ui/Hud';
import { DraftOverlay, Overlay, UpgradeInventoryPanel } from './ui/Overlays';
import { TouchControls } from './ui/TouchControls';
import type {
  DebugState,
  DraftOption,
  HudState,
  Settings,
  UpgradeInventoryItem,
  VirtualStickInput,
} from './types/game';

const FIRST_TIME_KEY = 'neon-drift-survivor:first-time-complete';

type TitlePanel = 'menu' | 'settings' | 'howToPlay';

type RunSummary = {
  timeSurvived: number;
  levelReached: number;
  enemiesDefeated: number;
  topUpgrades: UpgradeInventoryItem[];
  seed: number;
};

const initialHud: HudState = {
  timeSeconds: 0,
  level: 1,
  hp: 100,
  seed: 0,
  enemiesDefeated: 0,
  dashCooldownRemaining: 0,
  dashCooldownTotal: 2.5,
  xp: 0,
  xpToNext: 10,
  weaponName: 'Pulse Blaster',
  waveEventLabel: null,
  boss: {
    active: false,
    name: 'Neon Warden',
    hp: 0,
    maxHp: 0,
    phase: 1,
    phaseMarkers: [0.66, 0.33],
  },
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
  const [touchMovement, setTouchMovement] = useState<VirtualStickInput>({
    x: 0,
    y: 0,
    active: false,
  });
  const [touchDash, setTouchDash] = useState(false);

  const [draftActive, setDraftActive] = useState(false);
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>([]);
  const [upgradeInventory, setUpgradeInventory] = useState<UpgradeInventoryItem[]>([]);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  const [titlePanel, setTitlePanel] = useState<TitlePanel>(() => {
    if (typeof window === 'undefined') return 'menu';
    return window.localStorage.getItem(FIRST_TIME_KEY) ? 'menu' : 'howToPlay';
  });
  const [runStarted, setRunStarted] = useState(false);

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
    setDraftActive(false);
    setDraftOptions([]);
    setUpgradeInventory([]);
    setRunSummary(null);
    setRestartToken((token) => token + 1);
    setRunStarted(true);
    setCopyFeedback('');
  };

  const goToTitle = () => {
    setRunStarted(false);
    setPaused(false);
    setGameOver(false);
    setDraftActive(false);
    setRunSummary(null);
    setCopyFeedback('');
    setEngine(null);
    setTitlePanel('menu');
  };

  const startRun = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FIRST_TIME_KEY, '1');
    }
    restart();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copied!');
    } catch {
      setCopyFeedback('Clipboard unavailable');
    }
  };

  const summaryText = runSummary
    ? `Neon Drift Survivor run | ${runSummary.timeSurvived.toFixed(1)}s survived | level ${runSummary.levelReached} | ${runSummary.enemiesDefeated} enemies defeated | upgrades: ${runSummary.topUpgrades.length > 0 ? runSummary.topUpgrades.map((item) => `${item.label}${item.stacks > 1 ? ` x${item.stacks}` : ''}`).join(', ') : 'none'} | seed ${runSummary.seed}`
    : '';

  return (
    <main className={rootClassName}>
      {runStarted ? <Hud hud={hud} debug={debug} /> : null}

      {runStarted ? (
        <GameCanvas
          paused={paused}
          gameOver={gameOver}
          settings={settings}
          touchMovement={touchMovement}
          touchDash={touchDash}
          onHudChange={(next) => {
            setHud(next);
            if (next.hp <= 0 && !gameOver) {
              setGameOver(true);
              setPaused(false);
              const topUpgrades = [...upgradeInventory]
                .sort((a, b) => b.stacks - a.stacks || a.label.localeCompare(b.label))
                .slice(0, 5);
              setRunSummary({
                timeSurvived: next.timeSeconds,
                levelReached: next.level,
                enemiesDefeated: next.enemiesDefeated,
                topUpgrades,
                seed: next.seed,
              });
            }
          }}
          onDebugChange={setDebug}
          onTogglePause={() => {
            if (!gameOver) setPaused((value) => !value);
          }}
          onDraftChange={(active, options) => {
            setDraftActive(active);
            setDraftOptions(options);
          }}
          onInventoryChange={setUpgradeInventory}
          onEngineReady={setEngine}
          restartToken={restartToken}
        />
      ) : null}

      {!runStarted ? (
        <div className="menu-screen overlay">
          <div className="menu-panel">
            <h1>Neon Drift Survivor</h1>
            <p>Arcade survival in under 10 seconds: move, drift, dash, and stay alive.</p>
            <div className="menu-actions">
              <button type="button" onClick={startRun}>Play</button>
              <button type="button" onClick={() => setTitlePanel('settings')}>Settings</button>
              <button type="button" onClick={() => setTitlePanel('howToPlay')}>How to Play</button>
            </div>

            {titlePanel === 'settings' ? (
              <section className="title-subpanel">
                <h2>Settings</h2>
                <label>
                  Master volume
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
                <label>
                  <input
                    type="checkbox"
                    checked={settings.reduceMotion}
                    onChange={(event) => updateSetting('reduceMotion', event.target.checked)}
                  />
                  Reduce motion
                </label>
              </section>
            ) : null}

            {titlePanel === 'howToPlay' ? (
              <section className="title-subpanel">
                <h2>How to Play</h2>
                <ul>
                  <li>Move: WASD / Arrow keys / left touch stick.</li>
                  <li>Dash: Space / right touch button.</li>
                  <li>Pause: Esc.</li>
                  <li>Collect scrap to level up and pick upgrades.</li>
                  <li>Survive as long as possible.</li>
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {paused && !gameOver && !draftActive ? (
        <Overlay title="Paused" subtitle="Press Esc to resume" />
      ) : null}
      {gameOver && runSummary ? (
        <div className="overlay">
          <div className="run-summary">
            <h2>Run Summary</h2>
            <p>Time survived: {runSummary.timeSurvived.toFixed(1)}s</p>
            <p>Level reached: {runSummary.levelReached}</p>
            <p>Enemies defeated: {runSummary.enemiesDefeated}</p>
            <p>
              Top upgrades:{' '}
              {runSummary.topUpgrades.length > 0
                ? runSummary.topUpgrades
                    .map((item) => `${item.icon} ${item.label}${item.stacks > 1 ? ` x${item.stacks}` : ''}`)
                    .join(', ')
                : 'None'}
            </p>
            <div className="summary-seed-row">
              <span>Seed: {runSummary.seed}</span>
              <button type="button" onClick={() => copyToClipboard(String(runSummary.seed))}>
                Copy seed
              </button>
            </div>
            <button type="button" onClick={() => copyToClipboard(summaryText)}>
              Copy share text
            </button>
            {copyFeedback ? <p>{copyFeedback}</p> : null}
            <div className="menu-actions">
              <button className="restart-button-inline" type="button" onClick={restart}>
                Play again
              </button>
              <button type="button" onClick={goToTitle}>
                Back to title
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {draftActive ? (
        <DraftOverlay options={draftOptions} onPick={(index) => engine?.chooseDraftOption(index)} />
      ) : null}
      {runStarted ? <UpgradeInventoryPanel items={upgradeInventory} /> : null}

      {runStarted ? (
        <TouchControls
          onMoveChange={setTouchMovement}
          onDashChange={(pressed) => setTouchDash(pressed)}
        />
      ) : null}
    </main>
  );
}
