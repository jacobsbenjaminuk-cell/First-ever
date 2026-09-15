import type { GameAction, GameState } from '../core';

type GameOverProps = {
  readonly state: GameState;
  readonly dispatch: (action: GameAction) => void;
};

export function GameOver({ state, dispatch }: GameOverProps) {
  const won = state.winner === 'player';
  return (
    <div className="flex flex-col gap-4 bg-panel px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className={`text-sm tracking-[0.25em] uppercase ${won ? 'text-ember-bright' : 'text-steel'}`}>
          {won ? 'Enemy fleet destroyed' : 'Your fleet destroyed'}
        </span>
        <span className="text-xs text-muted">
          {state.player.shots.length} shots fired · {state.opponent.shots.length} taken
        </span>
      </div>
      <button
        type="button"
        onClick={() => dispatch({ type: 'reset' })}
        className="bg-ember px-4 py-3 text-sm tracking-[0.15em] uppercase transition-colors duration-[120ms] ease-out hover:bg-ember-bright"
      >
        Play again
      </button>
    </div>
  );
}
