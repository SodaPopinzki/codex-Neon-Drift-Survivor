import { useEffect, useRef } from 'react';
import { GameLoop } from '../engine/gameLoop';
import { InputController } from '../engine/input';
import type { Settings, VirtualStickInput } from '../types/game';
import { GameState } from './gameState';
import { Renderer } from './renderer';

type GameCanvasProps = {
  paused: boolean;
  gameOver: boolean;
  settings: Settings;
  touchMovement: VirtualStickInput;
  touchDash: boolean;
  onHudChange: (state: ReturnType<GameState['getHudState']>) => void;
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
  onTogglePause,
  restartToken,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const settingsRef = useRef(settings);
  const pauseRef = useRef(paused);
  const gameOverRef = useRef(gameOver);
  const hudCallbackRef = useRef(onHudChange);
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
    togglePauseRef.current = onTogglePause;
  }, [onTogglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameState = new GameState();
    const renderer = new Renderer(ctx, gameState);
    const input = new InputController();
    inputRef.current = input;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gameState.resize(canvas.width, canvas.height);
      renderer.render(settingsRef.current);
    };

    resize();
    window.addEventListener('resize', resize);

    const loop = new GameLoop({
      update: (dt) => {
        if (input.consumePausePressed()) {
          togglePauseRef.current();
        }

        if (input.consumeRestartPressed()) {
          gameState.reset();
        }

        if (pauseRef.current || gameOverRef.current) {
          return;
        }

        gameState.update(dt, input.getMovementVector(), input.isDashPressed());
        hudCallbackRef.current(gameState.getHudState());
      },
      render: () => renderer.render(settingsRef.current),
    });

    loop.start();

    return () => {
      loop.stop();
      input.dispose();
      window.removeEventListener('resize', resize);
      inputRef.current = null;
    };
  }, [restartToken]);

  useEffect(() => {
    inputRef.current?.setTouchMovement(touchMovement);
  }, [touchMovement]);

  useEffect(() => {
    inputRef.current?.setTouchDash(touchDash);
  }, [touchDash]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Neon Drift arena" />;
}
