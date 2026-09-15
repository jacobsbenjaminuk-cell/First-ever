import { useEffect, useMemo, useReducer } from 'react';
import { createInitialState, createRandomAI, gameReducer, opponentView } from '../core';

const AI_DELAY_MS = 450;

export function useBattleship() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState());
  const ai = useMemo(() => createRandomAI(), []);

  useEffect(() => {
    if (state.phase !== 'play' || state.turn !== 'opponent') return;
    const view = opponentView(state, 'opponent');
    const timer = window.setTimeout(() => {
      dispatch({ type: 'fire', by: 'opponent', at: ai.nextShot(view) });
    }, AI_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, ai]);

  return { state, dispatch };
}
