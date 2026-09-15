---
name: test-before-pr
description: Verification gate to run before opening any PR that touches the Battleship app — runs npm test and npm run build, plays one full game in the browser, captures 1440px and 375px screenshots, and checks the console is clean.
---

# Test before PR

Run every step in order. Do not open a PR while any step is failing.

## 1. Tests and build

```bash
npm install            # only if node_modules is missing or package.json changed
npm test               # vitest, single run — must be green
npm run build          # tsc -b then vite build — must succeed with no TS errors
grep -ri react src/core && echo "FAIL: React leaked into core" || echo "core is clean"
```

## 2. Serve the app

```bash
npm run preview -- --port 4173 --strictPort
```

Preview serves the production bundle, which is what the PR ships. Use
`npm run dev` only when you need hot reload while fixing something.

## 3. Play one full game in the browser

Drive the real UI, not the reducer:

1. Land on the placement phase (there is no splash or menu).
2. Place at least one ship by click and one by drag, and rotate with `R`.
3. Press **Clear**, then **Randomise**, then **Start battle**.
4. Fire at cells until the game ends. Confirm along the way:
   - a hit, a miss and a "hit and sunk the …" message all appear;
   - clicking an already-fired cell is rejected and the turn does not pass;
   - the turn indicator and both shot counters update and do not jitter.
5. Reach the game over screen and press **Play again**; the board resets to
   placement.

Shortcut for reaching the end state quickly: keep firing; the game is over when
all 17 ship cells on one side are hit.

## 4. Screenshots

Capture the play phase at both widths and attach them to the PR:

- 1440 x 900 (desktop)
- 375 x 812 (mobile)

## 5. Console must be clean

With devtools open for the whole session, confirm there are zero errors and zero
warnings (React key warnings and 404s count as failures). Record the console
state in the PR description.

## 6. Only then

Open the PR, including the two screenshots and a one-line confirmation that
tests, build, the full game run and the clean console all passed.
