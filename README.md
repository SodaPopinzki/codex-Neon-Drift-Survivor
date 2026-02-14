# Neon Drift Survivor

A Vite + React + TypeScript browser game scaffold using Canvas 2D rendering.

## Features

- Full-screen responsive Canvas 2D arena.
- 60fps semi-fixed game loop.
- Keyboard input:
  - Move: `WASD` or arrow keys
  - Dash: `Shift`
  - Pause toggle: `Esc`
  - Restart: `R`
- Touch controls for mobile:
  - Left virtual stick for movement
  - Right dash button
- React UI shell:
  - Top HUD (time, level, HP)
  - Pause and game-over overlays
- Local storage settings persistence:
  - Volume
  - Screen shake toggle
  - High contrast toggle

## Project Structure

```text
src/
  engine/      # loop + input systems
  game/        # game state, canvas renderer
  ui/          # HUD, overlays, touch controls
  styles/      # app styling
  types/       # shared TypeScript types
```

## Setup

```bash
npm install
```

## Run Dev Server

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## Lint & Format

```bash
npm run lint
npm run format
```

## Netlify Deploy

This repo includes `netlify.toml` configured for Vite SPA deployment.

### Option 1: Netlify UI

1. Connect the repository.
2. Build command: `npm run build`
3. Publish directory: `dist`

### Option 2: Netlify CLI

```bash
npm install -g netlify-cli
netlify deploy --build
netlify deploy --prod --dir=dist
```
