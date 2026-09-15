import { coordinateKey, isSunk, type Board, type Coordinate, type Shot } from '../core';

export type CellMark =
  | 'empty'
  | 'ship'
  | 'ship-hit'
  | 'ship-sunk'
  | 'miss'
  | 'hit'
  | 'preview'
  | 'preview-invalid';

export type MarkMap = ReadonlyMap<string, CellMark>;

export function ownBoardMarks(board: Board): MarkMap {
  const marks = new Map<string, CellMark>();
  for (const cell of board.incoming) marks.set(coordinateKey(cell), 'miss');
  for (const ship of board.ships) {
    const sunk = isSunk(ship);
    ship.cells.forEach((cell, index) => {
      marks.set(coordinateKey(cell), sunk ? 'ship-sunk' : ship.hits[index] ? 'ship-hit' : 'ship');
    });
  }
  return marks;
}

export function targetBoardMarks(shots: readonly Shot[]): MarkMap {
  const marks = new Map<string, CellMark>();
  for (const shot of shots) {
    marks.set(coordinateKey(shot.at), shot.outcome.kind === 'miss' ? 'miss' : 'hit');
  }
  return marks;
}

export function withPreview(marks: MarkMap, cells: readonly Coordinate[], valid: boolean): MarkMap {
  const next = new Map(marks);
  for (const cell of cells) {
    next.set(coordinateKey(cell), valid ? 'preview' : 'preview-invalid');
  }
  return next;
}
