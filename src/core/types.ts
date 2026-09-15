export const BOARD_SIZE = 10;

export const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

export type Coordinate = {
  /** 0-based row index, displayed as 1-10. */
  readonly row: number;
  /** 0-based column index, displayed as A-J. */
  readonly col: number;
};

export type Orientation = 'horizontal' | 'vertical';

export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

export type ShipSpec = {
  readonly id: ShipId;
  readonly name: string;
  readonly size: number;
};

export const FLEET: readonly ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

export const TOTAL_SHIP_CELLS = FLEET.reduce((sum, ship) => sum + ship.size, 0);

export type Ship = {
  readonly id: ShipId;
  readonly name: string;
  readonly size: number;
  readonly origin: Coordinate;
  readonly orientation: Orientation;
  readonly cells: readonly Coordinate[];
  readonly hits: readonly boolean[];
};

export type Board = {
  readonly ships: readonly Ship[];
  /** Every cell that has been fired at on this board, in shot order. */
  readonly incoming: readonly Coordinate[];
};

export type ShotOutcome =
  | { readonly kind: 'miss' }
  | { readonly kind: 'hit' }
  | { readonly kind: 'sunk'; readonly shipId: ShipId; readonly shipName: string };

export type Shot = {
  readonly at: Coordinate;
  readonly outcome: ShotOutcome;
};

export type Side = 'player' | 'opponent';

export type PlayerState = {
  readonly board: Board;
  /** Shots this side has fired at the other board, in order. */
  readonly shots: readonly Shot[];
};

export type Phase = 'placement' | 'play' | 'gameover';

export type GameState = {
  readonly phase: Phase;
  readonly turn: Side;
  readonly player: PlayerState;
  readonly opponent: PlayerState;
  readonly winner: Side | null;
  /** Human-readable result of the last action; null after actions with nothing to report. */
  readonly message: string | null;
};

/**
 * Everything an AI is allowed to know: the board geometry and its own shot
 * history. There is deliberately no path from this type to any ship position,
 * so an AI cannot cheat even by accident.
 */
export type OpponentView = {
  readonly boardSize: number;
  readonly shots: readonly Shot[];
};

export type AI = {
  readonly name: string;
  nextShot(view: OpponentView): Coordinate;
};
