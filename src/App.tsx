import { GameOver } from './ui/GameOver';
import { PlacementPhase } from './ui/PlacementPhase';
import { PlayPhase } from './ui/PlayPhase';
import { useBattleship } from './ui/useBattleship';

export default function App() {
  const { state, dispatch } = useBattleship();

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-sm tracking-[0.35em] uppercase">Battleship</h1>
        <span className="text-xs text-muted">10 × 10 · fleet 5 4 3 3 2</span>
      </header>

      {state.phase === 'gameover' && <GameOver state={state} dispatch={dispatch} />}
      {state.phase === 'placement' ? (
        <PlacementPhase state={state} dispatch={dispatch} />
      ) : (
        <PlayPhase state={state} dispatch={dispatch} />
      )}
    </main>
  );
}
