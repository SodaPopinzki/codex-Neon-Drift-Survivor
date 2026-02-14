# QA Checklist

Use this checklist before merging to `main` and before promoting a deployment.

## Core gameplay controls
- [ ] Keyboard movement is responsive and directional inputs can be combined.
- [ ] Primary attack/control actions trigger consistently.
- [ ] Input remapping (if present) applies immediately and persists as expected.

## Pause and resume
- [ ] Pause can be toggled during active gameplay.
- [ ] Game state (player position, HP, enemies, timers) is frozen while paused.
- [ ] Resume restores gameplay without desync, stutter, or duplicated events.

## Level-up drafting
- [ ] Level-up UI appears at expected XP thresholds.
- [ ] Draft choices are valid, readable, and selectable.
- [ ] Selected upgrade applies once and updates relevant stats/abilities.

## Boss fight flow
- [ ] Boss encounter triggers at the expected progression point.
- [ ] Boss mechanics (attacks/phases) execute without broken animations or logic stalls.
- [ ] Win/loss outcomes resolve correctly and return to the appropriate state/screen.

## Mobile touch controls
- [ ] Touch joystick/buttons render and are usable on a mobile viewport.
- [ ] Multi-touch interactions do not block movement or actions.
- [ ] Controls do not overlap critical HUD elements on common screen sizes.

## Performance target
- [ ] Desktop: sustained ~60 FPS under normal combat load.
- [ ] Mobile: sustained playable frame rate (target 30+ FPS) under normal combat load.
- [ ] No severe memory growth or noticeable hitching during a 10+ minute run.
