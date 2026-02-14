import { useMemo, useRef, useState } from 'react';
import type { VirtualStickInput } from '../types/game';

type TouchControlsProps = {
  onMoveChange: (stick: VirtualStickInput) => void;
  onDashChange: (pressed: boolean) => void;
};

const STICK_RADIUS = 44;

export function TouchControls({ onMoveChange, onDashChange }: TouchControlsProps) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });

  const thumbStyle = useMemo(
    () => ({ transform: `translate(${thumb.x}px, ${thumb.y}px)` }),
    [thumb.x, thumb.y],
  );

  const updateStick = (clientX: number, clientY: number) => {
    const zone = zoneRef.current;
    if (!zone) return;

    const rect = zone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    const limitedDistance = Math.min(distance, STICK_RADIUS);
    const angle = Math.atan2(dy, dx);

    const normalizedX = distance === 0 ? 0 : (Math.cos(angle) * limitedDistance) / STICK_RADIUS;
    const normalizedY = distance === 0 ? 0 : (Math.sin(angle) * limitedDistance) / STICK_RADIUS;

    setThumb({ x: normalizedX * STICK_RADIUS, y: normalizedY * STICK_RADIUS });
    onMoveChange({ x: normalizedX, y: normalizedY, active: true });
  };

  return (
    <div className="touch-controls" aria-hidden>
      <div
        ref={zoneRef}
        className="touch-stick"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          updateStick(touch.clientX, touch.clientY);
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          updateStick(touch.clientX, touch.clientY);
        }}
        onTouchEnd={() => {
          setThumb({ x: 0, y: 0 });
          onMoveChange({ x: 0, y: 0, active: false });
        }}
      >
        <div className="touch-stick-thumb" style={thumbStyle} />
      </div>

      <button
        className="dash-button"
        type="button"
        onTouchStart={() => onDashChange(true)}
        onTouchEnd={() => onDashChange(false)}
      >
        Dash
      </button>
    </div>
  );
}
