import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FLEET,
  placeShip,
  removeShip,
  shipCells,
  type Coordinate,
  type GameState,
  type Orientation,
  type ShipId,
} from '../core';
import type { GameAction } from '../core';
import { Grid } from './Grid';
import { ownBoardMarks, withPreview } from './marks';

type PlacementPhaseProps = {
  readonly state: GameState;
  readonly dispatch: (action: GameAction) => void;
};

export function PlacementPhase({ state, dispatch }: PlacementPhaseProps) {
  const board = state.player.board;
  const placed = useMemo(() => new Set(board.ships.map((ship) => ship.id)), [board.ships]);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [selected, setSelected] = useState<ShipId>('carrier');
  const [hover, setHover] = useState<Coordinate | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Coordinate | null>(null);

  const nextUnplaced = FLEET.find((ship) => !placed.has(ship.id))?.id;
  const previouslyPlaced = useRef(placed);

  useEffect(() => {
    const justPlaced = !previouslyPlaced.current.has(selected) && placed.has(selected);
    previouslyPlaced.current = placed;
    if (justPlaced && nextUnplaced) setSelected(nextUnplaced);
  }, [placed, selected, nextUnplaced]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'r' || event.key === 'R') {
        setOrientation((current) => (current === 'horizontal' ? 'vertical' : 'horizontal'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const spec = FLEET.find((ship) => ship.id === selected) ?? FLEET[0]!;

  const place = useCallback(
    (origin: Coordinate, direction: Orientation) => {
      dispatch({ type: 'place', shipId: spec.id, origin, orientation: direction });
    },
    [dispatch, spec.id],
  );

  const handleUp = (coord: Coordinate) => {
    const origin = dragOrigin;
    setDragOrigin(null);
    if (!origin || (origin.row === coord.row && origin.col === coord.col)) {
      place(coord, orientation);
      return;
    }
    const vertical = Math.abs(coord.row - origin.row) >= Math.abs(coord.col - origin.col);
    const direction: Orientation = vertical ? 'vertical' : 'horizontal';
    setOrientation(direction);
    place({ row: Math.min(origin.row, coord.row), col: Math.min(origin.col, coord.col) }, direction);
  };

  const preview = useMemo(() => {
    const base = ownBoardMarks(board);
    if (!hover) return base;
    const direction: Orientation =
      dragOrigin && (dragOrigin.row !== hover.row || dragOrigin.col !== hover.col)
        ? Math.abs(hover.row - dragOrigin.row) >= Math.abs(hover.col - dragOrigin.col)
          ? 'vertical'
          : 'horizontal'
        : orientation;
    const origin = dragOrigin
      ? { row: Math.min(dragOrigin.row, hover.row), col: Math.min(dragOrigin.col, hover.col) }
      : hover;
    const cells = shipCells(origin, direction, spec.size);
    const valid = placeShip(removeShip(board, spec.id), spec.id, origin, direction).ok;
    return withPreview(base, cells, valid);
  }, [board, hover, dragOrigin, orientation, spec.id, spec.size]);

  const ready = board.ships.length === FLEET.length;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <Grid
        title="Your waters — place your fleet"
        marks={preview}
        active
        interactive
        onCellDown={setDragOrigin}
        onCellUp={handleUp}
        onCellEnter={setHover}
        onPointerLeaveGrid={() => {
          setHover(null);
          setDragOrigin(null);
        }}
      />

      <div className="flex w-full max-w-xs flex-col gap-4">
        <p className="text-xs leading-relaxed text-muted">
          Click a cell to drop the selected ship, or drag from bow to stern. Press
          <span className="mx-1 bg-sea px-1 py-0.5 text-ink">R</span>
          to rotate.
        </p>

        <ul className="flex flex-col gap-[2px]">
          {FLEET.map((ship) => {
            const isPlaced = placed.has(ship.id);
            const isSelected = ship.id === selected;
            return (
              <li key={ship.id}>
                <button
                  type="button"
                  onClick={() => setSelected(ship.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-xs transition-colors duration-[120ms] ease-out ${
                    isSelected ? 'bg-sea-hover text-ink' : 'bg-panel text-muted hover:bg-sea'
                  }`}
                >
                  <span>{ship.name}</span>
                  <span className="flex items-center gap-3">
                    <span>{ship.size}</span>
                    <span className={isPlaced ? 'text-steel' : 'text-muted'}>
                      {isPlaced ? 'placed' : '—'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-[2px]">
          <ToolButton onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}>
            Rotate · {orientation === 'horizontal' ? 'H' : 'V'}
          </ToolButton>
          <ToolButton onClick={() => dispatch({ type: 'randomise' })}>Randomise</ToolButton>
          <ToolButton onClick={() => dispatch({ type: 'clear' })}>Clear</ToolButton>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => dispatch({ type: 'start' })}
          className={`px-4 py-3 text-sm tracking-[0.15em] uppercase transition-colors duration-[120ms] ease-out ${
            ready ? 'bg-ember text-ink hover:bg-ember-bright' : 'bg-panel text-muted'
          }`}
        >
          Start battle
        </button>

        <p className="min-h-4 text-xs text-miss-mark">{state.message}</p>
      </div>
    </div>
  );
}

function ToolButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-panel px-3 py-2 text-xs text-ink transition-colors duration-[120ms] ease-out hover:bg-sea-hover"
    >
      {children}
    </button>
  );
}
