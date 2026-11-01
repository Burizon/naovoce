import type { Kind } from "../api.ts";
import type { Filters } from "../filters.ts";
import { MONTHS, kindColor } from "../seasons.ts";

interface Props {
  filters: Filters;
  kinds: Map<string, Kind>;
  onChange: (filters: Filters) => void;
}

/** Active filters over the map; each can be removed, or all at once. */
export function FilterChips({ filters, kinds, onChange }: Props) {
  const chips: { key: string; label: string; color?: string; remove: () => void }[] = [];
  if (filters.month !== null) {
    const month = MONTHS[filters.month - 1] ?? "";
    chips.push({
      key: "month",
      label: `Sklizeň: ${month}`,
      remove: () => onChange({ ...filters, month: null }),
    });
  }
  if (filters.ripeOnly) {
    chips.push({ key: "ripe", label: "Teď zralé", remove: () => onChange({ ...filters, ripeOnly: false }) });
  }
  for (const key of filters.kinds) {
    const kind = kinds.get(key);
    chips.push({
      key,
      label: kind?.name ?? key,
      ...(kind ? { color: kindColor(kind.col) } : {}),
      remove: () => {
        const next = new Set(filters.kinds);
        next.delete(key);
        onChange({ ...filters, kinds: next });
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="filter-chips" aria-label="Aktivní filtry">
      {chips.map((chip) => (
        <button key={chip.key} type="button" className="chip" onClick={chip.remove} title="Odebrat filtr">
          {chip.color && <span className="kind-dot" style={{ background: chip.color }} />}
          {chip.label} <span aria-hidden="true">×</span>
        </button>
      ))}
      <button
        type="button"
        className="chip clear"
        onClick={() => onChange({ kinds: new Set(), month: null, ripeOnly: false })}
      >
        Zrušit filtr
      </button>
    </div>
  );
}
