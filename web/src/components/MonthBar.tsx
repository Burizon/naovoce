import { MONTHS, MONTHS_SHORT } from "../seasons.ts";

interface Props {
  month: number | null;
  ripeOnly: boolean;
  onMonth: (month: number | null) => void;
  onRipeOnly: (value: boolean) => void;
}

/** Harvest timeline: pick a month to see what can be harvested then. */
export function MonthBar({ month, ripeOnly, onMonth, onRipeOnly }: Props) {
  const current = new Date().getMonth() + 1;

  return (
    <div className="monthbar" role="toolbar" aria-label="Filtr podle sezóny sklizně">
      <span className="monthbar-label">Co se sklízí</span>
      <div className="months">
        {MONTHS_SHORT.map((label, index) => {
          const value = index + 1;
          return (
            <button
              key={label}
              type="button"
              className={value === current ? "month current" : "month"}
              aria-pressed={!ripeOnly && month === value}
              title={value === current ? `${MONTHS[index]} (teď)` : MONTHS[index]}
              onClick={() => onMonth(value)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button type="button" className="month all" aria-pressed={!ripeOnly && month === null} onClick={() => onMonth(null)}>
        celý rok
      </button>
      <button
        type="button"
        className="ripe-toggle"
        aria-pressed={ripeOnly}
        onClick={() => onRipeOnly(!ripeOnly)}
        title="Místa, která lidé v posledních 10 dnech nahlásili jako zralá"
      >
        <span className="dot ripe" aria-hidden="true" /> Teď zralé podle hlášení
      </button>
    </div>
  );
}
