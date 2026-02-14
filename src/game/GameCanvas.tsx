import { useEffect, useRef } from 'react';
import { Engine } from '../engine/Engine';
import type { DebugState, DraftOption, HudState, Settings, UpgradeInventoryItem, VirtualStickInput } from '../types/game';

type GameCanvasProps = {
  paused: boolean;
  gameOver: boolean;
  settings: Settings;
  touchMovement: VirtualStickInput;
  touchDash: boolean;
  onHudChange: (state: HudState) => void;
  onDebugChange: (state: DebugState) => void;
  onTogglePause: () => void;
  onDraftChange: (active: boolean, options: DraftOption[]) => void;
  onInventoryChange: (items: UpgradeInventoryItem[]) => void;
  onEngineReady: (engine: Engine | null) => void;
  restartToken: number;
};

export function GameCanvas({
  paused,
  gameOver,
  settings,
  touchMovement,
  touchDash,
  onHudChange,
  onDebugChange,
  onTogglePause,
  onDraftChange,
  onInventoryChange,
  onEngineReady,
  restartToken,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const settingsRef = useRef(settings);
  const pauseRef = useRef(paused);
  const gameOverRef = useRef(gameOver);
  const hudCallbackRef = useRef(onHudChange);
  const debugCallbackRef = useRef(onDebugChange);
  const togglePauseRef = useRef(onTogglePause);
  const draftRef = useRef(onDraftChange);
  const inventoryRef = useRef(onInventoryChange);
  const engineReadyRef = useRef(onEngineReady);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    pauseRef.current = paused;
  }, [paused]);

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    hudCallbackRef.current = onHudChange;
  }, [onHudChange]);

  useEffect(() => {
    debugCallbackRef.current = onDebugChange;
  }, [onDebugChange]);

  useEffect(() => {
    togglePauseRef.current = onTogglePause;
  }, [onTogglePause]);

  useEffect(() => {
    draftRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    inventoryRef.current = onInventoryChange;
  }, [onInventoryChange]);

  useEffect(() => {
    engineReadyRef.current = onEngineReady;
  }, [onEngineReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = new Engine(canvas, ctx, {
      onHudChange: (hud) => hudCallbackRef.current(hud),
      onDebugChange: (debug) => debugCallbackRef.current(debug),
      onPauseToggle: () => togglePauseRef.current(),
      onDraftChange: (active, options) => draftRef.current(active, options),
      onInventoryChange: (items) => inventoryRef.current(items),
      isPaused: () => pauseRef.current,
      isGameOver: () => gameOverRef.current,
      getSettings: () => settingsRef.current,
    });
    engineRef.current = engine;
    engineReadyRef.current(engine);

    engine.start();

    const resize = () => engine.resize();
    window.addEventListener('resize', resize);

    return () => {
      engine.stop();
      window.removeEventListener('resize', resize);
      engineRef.current = null;
      engineReadyRef.current(null);
    };
  }, [restartToken]);

  useEffect(() => {
    engineRef.current?.setTouchMovement(touchMovement);
  }, [touchMovement]);

  useEffect(() => {
    engineRef.current?.setTouchDash(touchDash);
  }, [touchDash]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Neon Drift arena" />;
}
