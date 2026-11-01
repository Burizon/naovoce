import type { Kind } from "../api.ts";
import { MONTHS } from "../seasons.ts";
import { kindColor } from "../seasons.ts";

interface Props {
  tiles: Kind[];
  counts: Map<string, number>;
  total: number;
  selected: ReadonlySet<string>;
  month: number | null;
  ripeOnly: boolean;
  search: string;
  onToggle: (key: string) => void;
}

/** Overview and kind tiles, like the category cards on map.na-ovoce.cz. */
export function KindPanel({ tiles, counts, total, selected, month, ripeOnly, search, onToggle }: Props) {
  const scope = ripeOnly
    ? "nahlášených jako zralé"
    : month
      ? `se sklizní v měsíci ${MONTHS[month - 1]}`
      : "na mapě";

  return (
    <div className="kind-panel">
      <section className="intro">
        <h2>Kdy je co zralé</h2>
        <p className="muted">
          Mapa jedlých stromů, keřů a bylinek s časem sklizně. Vyberte plodiny, nebo si v kalendáři sklizně zvolte
          měsíc.
        </p>
        <p className="count">
          <strong>{total.toLocaleString("cs-CZ")}</strong> míst {scope}
        </p>
      </section>

      {tiles.length === 0 ? (
        <p className="muted">{search ? `Plodinu „${search}“ jsme nenašli.` : "Nic tu zatím není."}</p>
      ) : (
        <ul className="plain kind-grid">
          {tiles.map((kind) => {
            const isSelected = selected.has(kind.key);
            return (
              <li key={kind.key}>
                <button
                  type="button"
                  className="kind-tile"
                  aria-pressed={isSelected}
                  onClick={() => onToggle(kind.key)}
                >
                  <span className="kind-icon" style={{ background: kindColor(kind.col) }} aria-hidden="true" />
                  <span className="kind-text">
                    <strong>{kind.name}</strong>
                    <span className="muted small">{(counts.get(kind.key) ?? 0).toLocaleString("cs-CZ")} míst</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
