import { useEffect, useState } from "react";
import { type Bbox, type CalendarRow, api } from "../api.ts";
import { MONTHS, MONTHS_SHORT, describeTypical, kindColor, typicalMonths } from "../seasons.ts";

interface Props {
  bbox: Bbox | null;
  month: number | null;
  selectedKinds: ReadonlySet<string>;
  onMonth: (month: number) => void;
  onKind: (kind: string) => void;
}

/** Kinds mapped in the visible area against the twelve months of the year. */
export function HarvestCalendar({ bbox, month, selectedKinds, onMonth, onKind }: Props) {
  const [rows, setRows] = useState<CalendarRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nowMonth = new Date().getMonth() + 1;

  useEffect(() => {
    if (!bbox) return;
    let current = true;
    const timer = window.setTimeout(() => {
      api
        .calendar(bbox)
        .then((list) => current && (setRows(list), setError(null)))
        .catch((reason: Error) => current && setError(reason.message));
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [bbox]);

  if (error) return <p className="notice">Kalendář se nepodařilo načíst: {error}</p>;
  if (!rows) return <p className="muted">Načítám kalendář…</p>;
  if (rows.length === 0) return <p className="muted">V tomto výřezu mapy zatím nic není. Posuňte nebo oddalte mapu.</p>;

  const sorted = rows.slice().sort((a, b) => firstMonth(a) - firstMonth(b) || b.count - a.count);
  const maxReports = Math.max(1, ...rows.flatMap((row) => row.ripe_reports_by_month));

  return (
    <div className="calendar">
      <p className="muted small">
        Plodiny ve výřezu mapy a kdy se sklízí. Plná barva je typická sezóna, tečky ukazují, kdy lidé hlásili zralé
        plody. Kliknutím na měsíc vyberete období sklizně, kliknutím na plodinu ji přidáte do filtru.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col" className="kind-col">
              Druh
            </th>
            {MONTHS_SHORT.map((label, index) => (
              <th
                key={label}
                scope="col"
                className={[index + 1 === nowMonth ? "now" : "", index + 1 === month ? "selected" : ""].join(" ")}
              >
                <button type="button" title={MONTHS[index]} onClick={() => onMonth(index + 1)}>
                  {label.slice(0, 1)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const months = typicalMonths(row.typical);
            const color = kindColor(row.col);
            return (
              <tr key={row.kind} className={selectedKinds.has(row.kind) ? "selected" : undefined}>
                <th scope="row" className="kind-col">
                  <button
                    type="button"
                    onClick={() => onKind(row.kind)}
                    title={row.typical.map(describeTypical).join(", ") || "Sezóna neznámá"}
                  >
                    <span className="kind-dot" style={{ background: color }} />
                    {row.name}
                    <span className="muted"> {row.count}</span>
                  </button>
                </th>
                {MONTHS_SHORT.map((label, index) => {
                  const reports = row.ripe_reports_by_month[index] ?? 0;
                  return (
                    <td
                      key={label}
                      className={[months.has(index + 1) ? "on" : "", index + 1 === nowMonth ? "now" : ""].join(" ")}
                      style={months.has(index + 1) ? { background: color } : undefined}
                      title={`${MONTHS[index]}: ${months.has(index + 1) ? "typická sezóna" : "mimo typickou sezónu"}${
                        reports ? `, ${reports}× nahlášeno zralé` : ""
                      }`}
                    >
                      {reports > 0 && (
                        <span className="report-dot" style={{ opacity: 0.45 + (0.55 * reports) / maxReports }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function firstMonth(row: CalendarRow): number {
  return Math.min(13, ...row.typical.map((season) => season.start));
}
