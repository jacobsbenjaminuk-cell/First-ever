import { allCoordinates, coordinateKey } from './coordinates';
import type { RandomSource } from './board';
import type { AI, Coordinate, OpponentView } from './types';

/**
 * Fires uniformly at random among cells this AI has not fired at yet. It only
 * ever reads `view`, which carries no ship positions.
 */
export function createRandomAI(random: RandomSource = Math.random): AI {
  return {
    name: 'Random',
    nextShot(view: OpponentView): Coordinate {
      const fired = new Set(view.shots.map((shot) => coordinateKey(shot.at)));
      const available = allCoordinates().filter(
        (coord) => coord.row < view.boardSize && coord.col < view.boardSize && !fired.has(coordinateKey(coord)),
      );
      if (available.length === 0) {
        throw new Error('No cells left to fire at');
      }
      const index = Math.min(available.length - 1, Math.floor(random() * available.length));
      return available[index]!;
    },
  };
}
