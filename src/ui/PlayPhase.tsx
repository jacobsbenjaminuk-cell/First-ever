import { FLEET, type Coordinate, type GameAction, type GameState } from '../core';
import { Grid } from './Grid';
import { ownBoardMarks, targetBoardMarks } from './marks';

type PlayPhaseProps = {
  readonly state: GameState;
  readonly dispatch: (action: GameAction) => void;
};

export function PlayPhase({ state, dispatch }: PlayPhaseProps) {
  const yourTurn = state.turn === 'player' && state.phase === 'play';

  const fire = (coord: Coordinate) => {
    if (!yourTurn) return;
    dispatch({ type: 'fire', by: 'player', at: coord });
  };

  return (
    <div className="flex flex-col gap-6">
      <StatusBar state={state} />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <Grid
          title="Enemy waters — click to fire"
          marks={targetBoardMarks(state.player.shots)}
          active={yourTurn}
          interactive={yourTurn}
          onCellUp={fire}
        />
        <Grid title="Your fleet" marks={ownBoardMarks(state.player.board)} active={!yourTurn} />
      </div>
      <FleetStatus state={state} />
    </div>
  );
}

function StatusBar({ state }: { readonly state: GameState }) {
  const yourTurn = state.turn === 'player';
  return (
    <div className="flex flex-col gap-3 bg-panel px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="shrink-0 text-xs tracking-[0.2em] uppercase">
          {state.phase === 'gameover' ? 'Battle over' : yourTurn ? 'Your turn' : 'Enemy turn'}
        </span>
        <span className="min-h-4 truncate text-xs text-miss-mark">{state.message}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-4">
        <Counter label="Your shots" value={state.player.shots.length} />
        <Counter label="Enemy shots" value={state.opponent.shots.length} />
        <Counter label="Your hits" value={countHits(state, 'player')} />
        <Counter label="Enemy hits" value={countHits(state, 'opponent')} />
      </div>
    </div>
  );
}

function Counter({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className="w-6 shrink-0 text-right text-ink tabular-nums">{String(value).padStart(2, '0')}</span>
    </span>
  );
}

function countHits(state: GameState, side: 'player' | 'opponent'): number {
  return state[side].shots.filter((shot) => shot.outcome.kind !== 'miss').length;
}

function FleetStatus({ state }: { readonly state: GameState }) {
  const sunkByPlayer = new Set(
    state.player.shots.flatMap((shot) => (shot.outcome.kind === 'sunk' ? [shot.outcome.shipId] : [])),
  );
  const sunkByEnemy = new Set(
    state.player.board.ships.filter((ship) => ship.hits.every(Boolean)).map((ship) => ship.id),
  );

  return (
    <div className="flex flex-col gap-2 text-xs text-muted sm:flex-row sm:gap-10">
      <FleetList title="Enemy fleet" sunk={sunkByPlayer} />
      <FleetList title="Your fleet" sunk={sunkByEnemy} />
    </div>
  );
}

function FleetList({ title, sunk }: { readonly title: string; readonly sunk: ReadonlySet<string> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="tracking-[0.2em] uppercase">{title}</span>
      {FLEET.map((ship) => (
        <span key={ship.id} className={sunk.has(ship.id) ? 'text-ember-bright line-through' : 'text-steel'}>
          {ship.name}
        </span>
      ))}
    </div>
  );
}
