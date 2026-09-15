import { allCoordinates, coordinateKey, isOnBoard, sameCoordinate } from './coordinates';
import {
  BOARD_SIZE,
  FLEET,
  type Board,
  type Coordinate,
  type Orientation,
  type Ship,
  type ShipId,
  type ShipSpec,
  type ShotOutcome,
} from './types';

export type PlacementRejection =
  | 'off-board'
  | 'overlap'
  | 'unknown-ship'
  | 'already-placed';

export type PlacementResult =
  | { readonly ok: true; readonly board: Board }
  | { readonly ok: false; readonly reason: PlacementRejection };

export const EMPTY_BOARD: Board = { ships: [], incoming: [] };

export function shipSpec(id: ShipId): ShipSpec | undefined {
  return FLEET.find((spec) => spec.id === id);
}

export function shipCells(
  origin: Coordinate,
  orientation: Orientation,
  size: number,
): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let step = 0; step < size; step += 1) {
    cells.push(
      orientation === 'horizontal'
        ? { row: origin.row, col: origin.col + step }
        : { row: origin.row + step, col: origin.col },
    );
  }
  return cells;
}

export function placeShip(
  board: Board,
  shipId: ShipId,
  origin: Coordinate,
  orientation: Orientation,
): PlacementResult {
  const spec = shipSpec(shipId);
  if (!spec) return { ok: false, reason: 'unknown-ship' };
  if (board.ships.some((ship) => ship.id === shipId)) {
    return { ok: false, reason: 'already-placed' };
  }

  const cells = shipCells(origin, orientation, spec.size);
  // A horizontal ship that runs past column J is off the board; it never wraps
  // onto the next row because the row index is held constant per cell.
  if (!cells.every(isOnBoard)) return { ok: false, reason: 'off-board' };

  const occupied = new Set(
    board.ships.flatMap((ship) => ship.cells.map(coordinateKey)),
  );
  if (cells.some((cell) => occupied.has(coordinateKey(cell)))) {
    return { ok: false, reason: 'overlap' };
  }

  const ship: Ship = {
    id: spec.id,
    name: spec.name,
    size: spec.size,
    origin,
    orientation,
    cells,
    hits: cells.map(() => false),
  };
  return { ok: true, board: { ...board, ships: [...board.ships, ship] } };
}

export function removeShip(board: Board, shipId: ShipId): Board {
  return { ...board, ships: board.ships.filter((ship) => ship.id !== shipId) };
}

export function clearBoard(board: Board): Board {
  return { ...board, ships: [] };
}

export function isFleetComplete(board: Board): boolean {
  return board.ships.length === FLEET.length;
}

export function hasBeenFiredAt(board: Board, target: Coordinate): boolean {
  return board.incoming.some((cell) => sameCoordinate(cell, target));
}

export function isSunk(ship: Ship): boolean {
  return ship.hits.every(Boolean);
}

export function isFleetDestroyed(board: Board): boolean {
  return isFleetComplete(board) && board.ships.every(isSunk);
}

export type ResolvedShot = { readonly board: Board; readonly outcome: ShotOutcome };

/** Applies a shot to a board, returning a new board; the input is untouched. */
export function resolveShot(board: Board, target: Coordinate): ResolvedShot {
  const incoming = [...board.incoming, target];
  const hitIndex = board.ships.findIndex((ship) =>
    ship.cells.some((cell) => sameCoordinate(cell, target)),
  );

  if (hitIndex === -1) {
    return { board: { ...board, incoming }, outcome: { kind: 'miss' } };
  }

  const ships = board.ships.map((ship, index) => {
    if (index !== hitIndex) return ship;
    return {
      ...ship,
      hits: ship.hits.map(
        (hit, cellIndex) => hit || sameCoordinate(ship.cells[cellIndex]!, target),
      ),
    };
  });

  const struck = ships[hitIndex]!;
  const outcome: ShotOutcome = isSunk(struck)
    ? { kind: 'sunk', shipId: struck.id, shipName: struck.name }
    : { kind: 'hit' };

  return { board: { ships, incoming }, outcome };
}

export type RandomSource = () => number;

export function randomBoard(random: RandomSource = Math.random): Board {
  let board = EMPTY_BOARD;
  for (const spec of FLEET) {
    board = placeShipAtRandom(board, spec, random);
  }
  return board;
}

function placeShipAtRandom(board: Board, spec: ShipSpec, random: RandomSource): Board {
  const orientations: Orientation[] = ['horizontal', 'vertical'];
  const candidates = allCoordinates().flatMap((origin) =>
    orientations.map((orientation) => ({ origin, orientation })),
  );

  for (let attempt = candidates.length; attempt > 0; attempt -= 1) {
    const index = Math.floor(random() * attempt) % attempt;
    const candidate = candidates[index]!;
    candidates[index] = candidates[attempt - 1]!;
    const result = placeShip(board, spec.id, candidate.origin, candidate.orientation);
    if (result.ok) return result.board;
  }
  throw new Error(`Could not place ${spec.name} on a ${BOARD_SIZE}x${BOARD_SIZE} board`);
}
