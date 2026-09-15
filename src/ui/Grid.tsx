import { BOARD_SIZE, COLUMN_LETTERS, coordinateKey, formatCoordinate, type Coordinate } from '../core';
import type { CellMark, MarkMap } from './marks';

const MARK_CLASS: Record<CellMark, string> = {
  empty: 'bg-sea',
  ship: 'bg-steel',
  'ship-hit': 'bg-ember',
  'ship-sunk': 'bg-ember-bright',
  miss: 'bg-sea text-miss-mark',
  hit: 'bg-ember',
  preview: 'bg-steel/70',
  'preview-invalid': 'bg-ember/40',
};

type GridProps = {
  readonly title: string;
  readonly marks: MarkMap;
  readonly active?: boolean;
  readonly interactive?: boolean;
  readonly onCellDown?: (coord: Coordinate) => void;
  readonly onCellUp?: (coord: Coordinate) => void;
  readonly onCellEnter?: (coord: Coordinate) => void;
  readonly onPointerLeaveGrid?: () => void;
};

const rows = Array.from({ length: BOARD_SIZE }, (_, index) => index);

export function Grid({
  title,
  marks,
  active = false,
  interactive = false,
  onCellDown,
  onCellUp,
  onCellEnter,
  onPointerLeaveGrid,
}: GridProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs tracking-[0.2em] text-muted uppercase">{title}</h2>
      <div
        className={`inline-block bg-panel p-2 ${active ? 'grid-shadow' : ''}`}
        onPointerLeave={onPointerLeaveGrid}
      >
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `1.5rem repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
        >
          <div aria-hidden className="h-6" />
          {COLUMN_LETTERS.map((letter) => (
            <div key={letter} className="flex h-6 items-center justify-center text-xs text-muted">
              {letter}
            </div>
          ))}
          {rows.map((row) => (
            <Row
              key={row}
              row={row}
              marks={marks}
              interactive={interactive}
              {...(onCellDown ? { onCellDown } : {})}
              {...(onCellUp ? { onCellUp } : {})}
              {...(onCellEnter ? { onCellEnter } : {})}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type RowProps = {
  readonly row: number;
  readonly marks: MarkMap;
  readonly interactive: boolean;
  readonly onCellDown?: (coord: Coordinate) => void;
  readonly onCellUp?: (coord: Coordinate) => void;
  readonly onCellEnter?: (coord: Coordinate) => void;
};

function Row({ row, marks, interactive, onCellDown, onCellUp, onCellEnter }: RowProps) {
  return (
    <>
      <div className="flex items-center justify-center text-xs text-muted">{row + 1}</div>
      {COLUMN_LETTERS.map((_, col) => {
        const coord: Coordinate = { row, col };
        const mark = marks.get(coordinateKey(coord)) ?? 'empty';
        return (
          <button
            key={col}
            type="button"
            disabled={!interactive}
            aria-label={`${formatCoordinate(coord)} ${mark}`}
            onPointerDown={() => onCellDown?.(coord)}
            onPointerUp={() => onCellUp?.(coord)}
            onPointerEnter={() => onCellEnter?.(coord)}
            className={`aspect-square w-full min-w-7 rounded-none text-xs transition-colors duration-[120ms] ease-out ${
              MARK_CLASS[mark]
            } ${
              interactive
                ? mark === 'empty'
                  ? 'cursor-crosshair hover:bg-sea-hover'
                  : 'cursor-crosshair'
                : 'cursor-default'
            }`}
          >
            {mark === 'miss' ? '·' : mark === 'hit' || mark === 'ship-hit' || mark === 'ship-sunk' ? '×' : ''}
          </button>
        );
      })}
    </>
  );
}
