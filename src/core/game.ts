import {
  EMPTY_BOARD,
  clearBoard,
  hasBeenFiredAt,
  isFleetComplete,
  isFleetDestroyed,
  placeShip,
  randomBoard,
  removeShip,
  resolveShot,
  type RandomSource,
} from './board';
import { formatCoordinate, isOnBoard } from './coordinates';
import {
  BOARD_SIZE,
  type Coordinate,
  type GameState,
  type OpponentView,
  type Orientation,
  type PlayerState,
  type ShipId,
  type Shot,
  type ShotOutcome,
  type Side,
} from './types';

export type GameAction =
  | { readonly type: 'place'; readonly shipId: ShipId; readonly origin: Coordinate; readonly orientation: Orientation }
  | { readonly type: 'remove'; readonly shipId: ShipId }
  | { readonly type: 'clear' }
  | { readonly type: 'randomise' }
  | { readonly type: 'start' }
  | { readonly type: 'fire'; readonly by: Side; readonly at: Coordinate }
  | { readonly type: 'reset' };

const PLACEMENT_REJECTIONS = {
  'off-board': 'That ship does not fit on the board.',
  overlap: 'Ships cannot overlap.',
  'unknown-ship': 'Unknown ship.',
  'already-placed': 'That ship is already on the board.',
} as const;

export function createInitialState(random: RandomSource = Math.random): GameState {
  return {
    phase: 'placement',
    turn: 'player',
    player: { board: EMPTY_BOARD, shots: [] },
    opponent: { board: randomBoard(random), shots: [] },
    winner: null,
    message: null,
  };
}

/** The only information an AI ever receives about the board it is shooting at. */
export function opponentView(state: GameState, side: Side): OpponentView {
  return { boardSize: BOARD_SIZE, shots: state[side].shots };
}

export function describeOutcome(at: Coordinate, outcome: ShotOutcome): string {
  const cell = formatCoordinate(at);
  if (outcome.kind === 'miss') return `${cell} miss`;
  if (outcome.kind === 'hit') return `${cell} hit`;
  return `${cell} hit and sunk the ${outcome.shipName}`;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'place':
      return applyPlacement(state, action);
    case 'remove':
      if (state.phase !== 'placement') return state;
      return {
        ...state,
        player: { ...state.player, board: removeShip(state.player.board, action.shipId) },
        message: null,
      };
    case 'clear':
      if (state.phase !== 'placement') return state;
      return {
        ...state,
        player: { ...state.player, board: clearBoard(state.player.board) },
        message: null,
      };
    case 'randomise':
      if (state.phase !== 'placement') return state;
      return {
        ...state,
        player: { ...state.player, board: randomBoard() },
        message: null,
      };
    case 'start':
      if (state.phase !== 'placement') return state;
      if (!isFleetComplete(state.player.board)) {
        return { ...state, message: 'Place your whole fleet first.' };
      }
      return { ...state, phase: 'play', turn: 'player', message: 'Your turn.' };
    case 'fire':
      return applyShot(state, action.by, action.at);
    case 'reset':
      return createInitialState();
    default:
      return state;
  }
}

function applyPlacement(
  state: GameState,
  action: Extract<GameAction, { type: 'place' }>,
): GameState {
  if (state.phase !== 'placement') return state;
  const board = removeShip(state.player.board, action.shipId);
  const result = placeShip(board, action.shipId, action.origin, action.orientation);
  if (!result.ok) {
    return { ...state, message: PLACEMENT_REJECTIONS[result.reason] };
  }
  return {
    ...state,
    player: { ...state.player, board: result.board },
    message: null,
  };
}

function applyShot(state: GameState, by: Side, at: Coordinate): GameState {
  if (state.phase !== 'play') return state;
  if (state.turn !== by) return { ...state, message: 'Not your turn.' };

  const defending: Side = by === 'player' ? 'opponent' : 'player';
  const defender = state[defending];

  if (!isOnBoard(at)) {
    return { ...state, message: 'That cell is off the board.' };
  }
  // A repeat shot is rejected outright: no board change and no turn change.
  if (hasBeenFiredAt(defender.board, at)) {
    return { ...state, message: `${formatCoordinate(at)} has already been fired at.` };
  }

  const { board, outcome } = resolveShot(defender.board, at);
  const shot: Shot = { at, outcome };
  const attacker: PlayerState = { ...state[by], shots: [...state[by].shots, shot] };
  const defeated = isFleetDestroyed(board);

  const defended: PlayerState = { ...defender, board };
  return {
    ...state,
    player: by === 'player' ? attacker : defended,
    opponent: by === 'player' ? defended : attacker,
    phase: defeated ? 'gameover' : 'play',
    turn: defeated ? by : defending,
    winner: defeated ? by : null,
    message: describeOutcome(at, outcome),
  };
}
