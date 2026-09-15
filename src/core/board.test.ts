import { describe, expect, it } from 'vitest';
import {
  EMPTY_BOARD,
  isFleetDestroyed,
  isSunk,
  placeShip,
  randomBoard,
  resolveShot,
} from './board';
import { BOARD_SIZE, FLEET, TOTAL_SHIP_CELLS, type Board } from './types';

function boardWith(...placements: Parameters<typeof placeShip>[1][]): Board {
  return placements.reduce<Board>((board, shipId) => {
    const result = placeShip(board, shipId, { row: 0, col: 0 }, 'horizontal');
    if (!result.ok) throw new Error(result.reason);
    return result.board;
  }, EMPTY_BOARD);
}

describe('fleet', () => {
  it('has 17 ship cells', () => {
    expect(TOTAL_SHIP_CELLS).toBe(17);
    expect(FLEET.map((ship) => ship.size)).toEqual([5, 4, 3, 3, 2]);
  });
});

describe('placement edges', () => {
  it('rejects a placement off the left edge', () => {
    expect(placeShip(EMPTY_BOARD, 'destroyer', { row: 4, col: -1 }, 'horizontal')).toEqual({
      ok: false,
      reason: 'off-board',
    });
  });

  it('rejects a placement off the right edge', () => {
    expect(placeShip(EMPTY_BOARD, 'carrier', { row: 4, col: 6 }, 'horizontal')).toEqual({
      ok: false,
      reason: 'off-board',
    });
  });

  it('rejects a placement off the top edge', () => {
    expect(placeShip(EMPTY_BOARD, 'destroyer', { row: -1, col: 3 }, 'vertical')).toEqual({
      ok: false,
      reason: 'off-board',
    });
  });

  it('rejects a placement off the bottom edge', () => {
    expect(placeShip(EMPTY_BOARD, 'cruiser', { row: 8, col: 3 }, 'vertical')).toEqual({
      ok: false,
      reason: 'off-board',
    });
  });

  it('accepts placements flush against each edge', () => {
    expect(placeShip(EMPTY_BOARD, 'carrier', { row: 0, col: 0 }, 'horizontal').ok).toBe(true);
    expect(placeShip(EMPTY_BOARD, 'carrier', { row: 9, col: 5 }, 'horizontal').ok).toBe(true);
    expect(placeShip(EMPTY_BOARD, 'carrier', { row: 5, col: 9 }, 'vertical').ok).toBe(true);
  });
});

describe('placement overlap', () => {
  it('rejects a ship overlapping another', () => {
    const board = boardWith('carrier');
    expect(placeShip(board, 'battleship', { row: 0, col: 3 }, 'horizontal')).toEqual({
      ok: false,
      reason: 'overlap',
    });
  });

  it('allows ships to touch', () => {
    const board = boardWith('carrier');
    const result = placeShip(board, 'battleship', { row: 1, col: 0 }, 'horizontal');
    expect(result.ok).toBe(true);
  });
});

describe('horizontal placement never wraps', () => {
  it('keeps every cell of a horizontal ship on one row', () => {
    const result = placeShip(EMPTY_BOARD, 'carrier', { row: 3, col: 5 }, 'horizontal');
    if (!result.ok) throw new Error(result.reason);
    const ship = result.board.ships[0]!;
    expect(ship.cells.every((cell) => cell.row === 3)).toBe(true);
    expect(ship.cells.map((cell) => cell.col)).toEqual([5, 6, 7, 8, 9]);
  });

  it('rejects rather than wrapping when a horizontal ship runs past column J', () => {
    const result = placeShip(EMPTY_BOARD, 'cruiser', { row: 3, col: 8 }, 'horizontal');
    expect(result).toEqual({ ok: false, reason: 'off-board' });
  });
});

describe('sinking', () => {
  it('is sunk only when every cell of that ship is hit', () => {
    const placed = placeShip(EMPTY_BOARD, 'cruiser', { row: 2, col: 2 }, 'horizontal');
    if (!placed.ok) throw new Error(placed.reason);
    let board = placed.board;

    const first = resolveShot(board, { row: 2, col: 2 });
    expect(first.outcome).toEqual({ kind: 'hit' });
    board = first.board;

    const second = resolveShot(board, { row: 2, col: 3 });
    expect(second.outcome).toEqual({ kind: 'hit' });
    expect(isSunk(second.board.ships[0]!)).toBe(false);
    board = second.board;

    const third = resolveShot(board, { row: 2, col: 4 });
    expect(third.outcome).toEqual({ kind: 'sunk', shipId: 'cruiser', shipName: 'Cruiser' });
    expect(isSunk(third.board.ships[0]!)).toBe(true);
  });

  it('does not mutate the board it is given', () => {
    const placed = placeShip(EMPTY_BOARD, 'destroyer', { row: 0, col: 0 }, 'horizontal');
    if (!placed.ok) throw new Error(placed.reason);
    const before = structuredClone(placed.board);
    resolveShot(placed.board, { row: 0, col: 0 });
    expect(placed.board).toEqual(before);
  });
});

describe('random board', () => {
  it('places the whole fleet without overlap', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const board = randomBoard();
      expect(board.ships).toHaveLength(FLEET.length);
      const cells = board.ships.flatMap((ship) => ship.cells);
      expect(cells).toHaveLength(TOTAL_SHIP_CELLS);
      expect(new Set(cells.map((cell) => `${cell.row},${cell.col}`)).size).toBe(TOTAL_SHIP_CELLS);
      expect(
        cells.every(
          (cell) => cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE,
        ),
      ).toBe(true);
    }
  });

  it('is destroyed only when all 17 ship cells are hit', () => {
    let board = randomBoard();
    const targets = board.ships.flatMap((ship) => ship.cells);
    targets.forEach((target, index) => {
      board = resolveShot(board, target).board;
      expect(isFleetDestroyed(board)).toBe(index === targets.length - 1);
    });
  });
});
