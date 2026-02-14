import { useEffect, useRef } from 'react';
import { Engine } from '../engine/Engine';
import type { DebugState, HudState, Settings, VirtualStickInput } from '../types/game';

type GameCanvasProps = {
  paused: boolean;
  gameOver: boolean;
  settings: Settings;
  touchMovement: VirtualStickInput;
  touchDash: boolean;
  onHudChange: (state: HudState) => void;
  onDebugChange: (state: DebugState) => void;
  onTogglePause: () => void;
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = new Engine(canvas, ctx, {
      onHudChange: (hud) => hudCallbackRef.current(hud),
      onDebugChange: (debug) => debugCallbackRef.current(debug),
      onPauseToggle: () => togglePauseRef.current(),
      isPaused: () => pauseRef.current,
      isGameOver: () => gameOverRef.current,
      getSettings: () => settingsRef.current,
    });
    engineRef.current = engine;

    engine.start();

    const resize = () => engine.resize();
    window.addEventListener('resize', resize);

    return () => {
      engine.stop();
      window.removeEventListener('resize', resize);
      engineRef.current = null;
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
