import { describe, expect, it } from 'vitest';
import { createRandomAI } from './ai';
import { createInitialState, gameReducer, opponentView } from './game';
import { TOTAL_SHIP_CELLS, type Coordinate, type GameState } from './types';

function startedGame(): GameState {
  const placed = gameReducer(createInitialState(), { type: 'randomise' });
  return gameReducer(placed, { type: 'start' });
}

describe('setup', () => {
  it('lands straight on placement with an enemy fleet ready', () => {
    const state = createInitialState();
    expect(state.phase).toBe('placement');
    expect(state.player.board.ships).toHaveLength(0);
    expect(state.opponent.board.ships).toHaveLength(5);
  });

  it('refuses to start until the whole fleet is placed', () => {
    const state = gameReducer(createInitialState(), { type: 'start' });
    expect(state.phase).toBe('placement');
    expect(state.message).toBe('Place your whole fleet first.');
  });

  it('clears and randomises the player fleet', () => {
    const randomised = gameReducer(createInitialState(), { type: 'randomise' });
    expect(randomised.player.board.ships).toHaveLength(5);
    expect(gameReducer(randomised, { type: 'clear' }).player.board.ships).toHaveLength(0);
  });

  it('reports an overlapping placement instead of applying it', () => {
    const base = gameReducer(createInitialState(), {
      type: 'place',
      shipId: 'carrier',
      origin: { row: 0, col: 0 },
      orientation: 'horizontal',
    });
    const overlapped = gameReducer(base, {
      type: 'place',
      shipId: 'battleship',
      origin: { row: 0, col: 2 },
      orientation: 'horizontal',
    });
    expect(overlapped.message).toBe('Ships cannot overlap.');
    expect(overlapped.player.board.ships).toHaveLength(1);
  });
});

describe('firing', () => {
  it('passes the turn to the opponent after a shot', () => {
    const state = gameReducer(startedGame(), { type: 'fire', by: 'player', at: { row: 0, col: 0 } });
    expect(state.turn).toBe('opponent');
    expect(state.player.shots).toHaveLength(1);
  });

  it('rejects a repeat shot without advancing the turn', () => {
    const first = gameReducer(startedGame(), { type: 'fire', by: 'player', at: { row: 4, col: 4 } });
    const back = gameReducer(first, { type: 'fire', by: 'opponent', at: { row: 0, col: 0 } });
    const repeat = gameReducer(back, { type: 'fire', by: 'player', at: { row: 4, col: 4 } });

    expect(repeat.turn).toBe('player');
    expect(repeat.player.shots).toHaveLength(1);
    expect(repeat.opponent.board.incoming).toHaveLength(1);
    expect(repeat.message).toBe('E5 has already been fired at.');
  });

  it('rejects a non-integer or off-board target without using the turn', () => {
    const state = startedGame();
    for (const at of [{ row: 1.5, col: 2 }, { row: Number.NaN, col: 0 }, { row: 10, col: 0 }]) {
      const rejected = gameReducer(state, { type: 'fire', by: 'player', at });
      expect(rejected.message).toBe('That cell is off the board.');
      expect(rejected.turn).toBe('player');
      expect(rejected.player.shots).toHaveLength(0);
    }
  });

  it('rejects a shot taken out of turn', () => {
    const state = gameReducer(startedGame(), { type: 'fire', by: 'opponent', at: { row: 0, col: 0 } });
    expect(state.message).toBe('Not your turn.');
    expect(state.opponent.shots).toHaveLength(0);
  });

  it('names the ship when a shot sinks it', () => {
    let state = startedGame();
    const destroyer = state.opponent.board.ships.find((ship) => ship.id === 'destroyer')!;
    destroyer.cells.forEach((cell, index) => {
      state = gameReducer(state, { type: 'fire', by: 'player', at: cell });
      if (index < destroyer.cells.length - 1) {
        state = gameReducer(state, { type: 'fire', by: 'opponent', at: { row: index, col: 9 } });
      }
    });
    expect(state.player.shots.at(-1)?.outcome).toEqual({
      kind: 'sunk',
      shipId: 'destroyer',
      shipName: 'Destroyer',
    });
    expect(state.message).toContain('hit and sunk the Destroyer');
  });
});

describe('winning', () => {
  it('wins only when all 17 ship cells are hit', () => {
    let state = startedGame();
    const targets: Coordinate[] = state.opponent.board.ships.flatMap((ship) => ship.cells);
    const filler: Coordinate[] = Array.from({ length: targets.length }, (_, index) => ({
      row: Math.floor(index / 10),
      col: index % 10,
    }));

    expect(targets).toHaveLength(TOTAL_SHIP_CELLS);

    targets.forEach((target, index) => {
      state = gameReducer(state, { type: 'fire', by: 'player', at: target });
      const last = index === targets.length - 1;
      expect(state.winner).toBe(last ? 'player' : null);
      expect(state.phase).toBe(last ? 'gameover' : 'play');
      if (!last) {
        state = gameReducer(state, { type: 'fire', by: 'opponent', at: filler[index]! });
      }
    });
  });

  it('ignores shots once the game is over', () => {
    let state = startedGame();
    state.opponent.board.ships
      .flatMap((ship) => ship.cells)
      .forEach((target, index) => {
        state = gameReducer(state, { type: 'fire', by: 'player', at: target });
        if (state.phase === 'play') {
          state = gameReducer(state, { type: 'fire', by: 'opponent', at: { row: Math.floor(index / 10), col: index % 10 } });
        }
      });
    const after = gameReducer(state, { type: 'fire', by: 'player', at: { row: 0, col: 0 } });
    expect(after).toBe(state);
  });
});

describe('opponent view', () => {
  it('exposes only the shooter\'s own shots', () => {
    const state = gameReducer(startedGame(), { type: 'fire', by: 'player', at: { row: 1, col: 1 } });
    const view = opponentView(state, 'opponent');
    expect(Object.keys(view).sort()).toEqual(['boardSize', 'shots']);
    expect(view.shots).toHaveLength(0);
    expect(JSON.stringify(view)).not.toContain('cells');
  });

  it('never repeats a shot the AI has already taken', () => {
    let state = startedGame();
    const ai = createRandomAI();
    const seen = new Set<string>();

    for (let turn = 0; turn < 220; turn += 1) {
      if (state.turn === 'player') {
        const next = ai.nextShot(opponentView(state, 'player'));
        state = gameReducer(state, { type: 'fire', by: 'player', at: next });
      } else {
        const next = ai.nextShot(opponentView(state, 'opponent'));
        const key = `${next.row},${next.col}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        state = gameReducer(state, { type: 'fire', by: 'opponent', at: next });
      }
      if (state.phase === 'gameover') break;
    }
    expect(state.phase).toBe('gameover');
  });
});
