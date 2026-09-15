import { BOARD_SIZE, COLUMN_LETTERS, type Coordinate } from './types';

export function isOnBoard(coord: Coordinate): boolean {
  return (
    Number.isInteger(coord.row) &&
    Number.isInteger(coord.col) &&
    coord.row >= 0 &&
    coord.row < BOARD_SIZE &&
    coord.col >= 0 &&
    coord.col < BOARD_SIZE
  );
}

export function sameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

export function coordinateKey(coord: Coordinate): string {
  return `${coord.row},${coord.col}`;
}

export function formatCoordinate(coord: Coordinate): string {
  return `${COLUMN_LETTERS[coord.col] ?? '?'}${coord.row + 1}`;
}

export function allCoordinates(): Coordinate[] {
  const coords: Coordinate[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      coords.push({ row, col });
    }
  }
  return coords;
}
