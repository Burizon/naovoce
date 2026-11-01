import { useEffect, useState } from "react";
import { type Bbox, type CalendarRow, api } from "../api.ts";
import { MONTHS, MONTHS_SHORT, harvestInMonth, kindColor, typicalMonths } from "../seasons.ts";

interface Props {
  bbox: Bbox | null;
  /** Months with any harvest; empty months (winter) are not offered. */
  months: number[];
  month: number | null;
  onMonth: (month: number) => void;
}

/** Month filter: pick a month and see what is harvested then in the visible part of the map. */
export function CalendarPanel({ bbox, months, month, onMonth }: Props) {
  const [rows, setRows] = useState<CalendarRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nowMonth = new Date().getMonth() + 1;

  // The box changes with every map move; its string key is stable for the same area.
  const bboxKey = bbox?.map((value) => value.toFixed(4)).join(",") ?? "";
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
  }, [bboxKey]);

  const entries = rows && month ? harvestInMonth(rows, month) : [];

  return (
    <div className="calendar-panel">
      <div className="month-picker" role="group" aria-label="Měsíc sklizně">
        {months.map((value) => (
          <button
            key={value}
            type="button"
            className={value === nowMonth ? "month-button now" : "month-button"}
            aria-pressed={value === month}
            onClick={() => onMonth(value)}
            title={value === nowMonth ? `${MONTHS[value - 1]} (teď)` : MONTHS[value - 1]}
          >
            {MONTHS_SHORT[value - 1]}
          </button>
        ))}
      </div>

      {error && <p className="notice">Kalendář se nepodařilo načíst: {error}</p>}
      {!error && !rows && <p className="muted">Načítám kalendář…</p>}

      {rows && month && (
        <section>
          <h3>Co se sklízí v měsíci {MONTHS[month - 1]}</h3>
          <p className="muted small">Ve výřezu mapy. Oddálením mapy uvidíte celou republiku.</p>
          {entries.length === 0 ? (
            <p className="muted">V tomto výřezu se v tomto měsíci nic nesklízí.</p>
          ) : (
            <ul className="plain month-list">
              {entries.map(({ row, typical, reports }) => (
                <li key={row.kind}>
                  <span className="kind-dot" style={{ background: kindColor(row.col) }} />
                  <span className="month-list-name">
                    {row.name} <span className="muted small">{row.count} míst</span>
                  </span>
                  <span className="tags">
                    {typical ? (
                      <span className="tag typical">typická sezóna</span>
                    ) : (
                      <span className="tag reported-only">jen podle hlášení</span>
                    )}
                    {reports > 0 && <span className="tag reported">zralé hlášeno {reports}×</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {rows && rows.length > 0 && <YearOverview rows={rows} months={months} month={month} onMonth={onMonth} />}
    </div>
  );
}

function YearOverview({
  rows,
  months,
  month,
  onMonth,
}: {
  rows: CalendarRow[];
  months: number[];
  month: number | null;
  onMonth: (month: number) => void;
}) {
  const nowMonth = new Date().getMonth() + 1;
  const sorted = rows
    .filter((row) => row.count > 0)
    .sort((a, b) => firstMonth(a) - firstMonth(b) || b.count - a.count);
  const maxReports = Math.max(1, ...rows.flatMap((row) => row.ripe_reports_by_month));

  return (
    <section className="calendar">
      <h3>Přehled sezón</h3>
      <p className="muted small">Plná barva je typická sezóna, tečky ukazují, kdy lidé hlásili zralé plody.</p>
      <table>
        <thead>
          <tr>
            <th scope="col" className="kind-col">
              <span className="sr-only">Plodina</span>
            </th>
            {months.map((value) => (
              <th
                key={value}
                scope="col"
                className={[value === nowMonth ? "now" : "", value === month ? "selected" : ""].join(" ")}
              >
                <button type="button" title={MONTHS[value - 1]} onClick={() => onMonth(value)}>
                  {MONTHS_SHORT[value - 1]?.slice(0, 2)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const typical = typicalMonths(row.typical);
            const color = kindColor(row.col);
            return (
              <tr key={row.kind}>
                <th scope="row" className="kind-col">
                  <span className="kind-dot" style={{ background: color }} />
                  {row.name}
                </th>
                {months.map((value) => {
                  const reports = row.ripe_reports_by_month[value - 1] ?? 0;
                  return (
                    <td
                      key={value}
                      className={[typical.has(value) ? "on" : "", value === nowMonth ? "now" : ""].join(" ")}
                      style={typical.has(value) ? { background: color } : undefined}
                      title={`${MONTHS[value - 1]}: ${typical.has(value) ? "typická sezóna" : "mimo typickou sezónu"}${
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
    </section>
  );
}

function firstMonth(row: CalendarRow): number {
  return Math.min(13, ...row.typical.map((season) => season.start));
}
