# AGENTS.md

Battleship: a two-player-vs-AI Battleship game built with Vite, React, TypeScript
(strict), Tailwind and Vitest. The Python procurement monitor
(`contracts_monitor.py`) is unrelated to the game and has its own dependencies in
`requirements.txt`.

## Setup

```bash
nvm use 22        # any Node >= 20 works
npm install
```

## Commands

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run dev`    | Vite dev server on http://localhost:5173      |
| `npm test`       | Vitest, single run                            |
| `npm run test:watch` | Vitest in watch mode                      |
| `npm run build`  | Type-check (`tsc -b`) then build to `dist/`   |
| `npm run preview`| Serve the production build locally            |

Both `npm test` and `npm run build` must pass before a PR is opened.

## Folder structure

```
src/
  core/          pure game logic, no React, no DOM
    types.ts       board/ship/shot/state types, fleet definition, OpponentView, AI
    coordinates.ts coordinate helpers (A1-J10 formatting, bounds, keys)
    board.ts       placement, shot resolution, random fleets
    game.ts        gameReducer over an immutable GameState
    ai.ts          AI implementations behind nextShot(view)
    *.test.ts      Vitest specs for the rules
  ui/            React components and presentation-only helpers
    Grid.tsx, PlacementPhase.tsx, PlayPhase.tsx, GameOver.tsx
    marks.ts       maps game state to per-cell display marks
    useBattleship.ts reducer + AI turn scheduling
  App.tsx, main.tsx, index.css
.agents/skills/  repository skills (see test-before-pr)
```

## Rules

- **`src/core` has no React imports.** No `react`, `react-dom`, JSX, hooks or DOM
  APIs anywhere under `src/core`. `grep -ri react src/core` must return nothing.
  Core is plain TypeScript that runs in Node under Vitest.
- **No game rules in React components.** Components dispatch actions and render
  state; every rule (placement validity, shot resolution, turn order, win
  detection) lives in `src/core`.
- **State is immutable.** `gameReducer` returns new objects; board arrays are
  never mutated in place.
- **The AI only sees `OpponentView`.** It exposes the board size and the AI's own
  shot history — no ship positions — so cheating is impossible by construction.
  New difficulties implement `AI.nextShot(view: OpponentView): Coordinate`.
- TypeScript is strict (including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`); do not loosen it to make code compile.
