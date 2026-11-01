import { useEffect, useState } from "react";
import { type NewsItem, type SeasonNews, api } from "../api.ts";
import { daysUntil, kindColor, shortDate } from "../seasons.ts";

interface Props {
  selected: ReadonlySet<string>;
  ripeOnly: boolean;
  onToggleKind: (key: string) => void;
  onRipeOnly: (value: boolean) => void;
  onSettings: () => void;
}

const SECTIONS: { key: keyof Omit<SeasonNews, "date">; title: string; describe: (item: NewsItem) => string }[] = [
  {
    key: "ripe_now",
    title: "Lidé teď hlásí zralé",
    describe: (item) => `${item.ripe_reports}× za posledních 10 dní`,
  },
  {
    key: "started",
    title: "Právě začala sezóna",
    describe: (item) => (item.window ? `od ${shortDate(item.window.start)}` : ""),
  },
  {
    key: "running",
    title: "Sezóna probíhá, nepropásněte ji",
    describe: (item) => (item.window ? `do ${shortDate(item.window.end)}` : ""),
  },
  {
    key: "ending",
    title: "Brzy končí",
    describe: (item) => (item.window ? `končí ${shortDate(item.window.end)}` : ""),
  },
  {
    key: "soon",
    title: "Brzy začíná",
    describe: (item) => (item.window ? `za ${daysLabel(daysUntil(item.window.start))}, ${shortDate(item.window.start)}` : ""),
  },
];

function daysLabel(days: number): string {
  if (days === 1) return "1 den";
  return days < 5 ? `${days} dny` : `${days} dní`;
}

/** What grows now: seasons that start, run and end, and what people report ripe. */
export function NowPanel({ selected, ripeOnly, onToggleKind, onRipeOnly, onSettings }: Props) {
  const [news, setNews] = useState<SeasonNews | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .news(30)
      .then(setNews)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <div className="now-panel">
      <section className="intro">
        <h2>Aktuálně</h2>
        <p className="muted">Na mapě je to, co se sklízí tento měsíc. Kliknutím na plodinu ji zvýrazníte.</p>
        <div className="row">
          <button type="button" className="toggle" aria-pressed={ripeOnly} onClick={() => onRipeOnly(!ripeOnly)}>
            <span className="dot ripe" aria-hidden="true" /> Jen nahlášené jako zralé
          </button>
          <button type="button" className="button ghost" onClick={onSettings}>
            Posílat sezónní zprávy
          </button>
        </div>
      </section>

      {error && <p className="notice">Přehled se nepodařilo načíst: {error}</p>}
      {!error && !news && <p className="muted">Načítám…</p>}

      {news &&
        SECTIONS.map(({ key, title, describe }) =>
          news[key].length === 0 ? null : (
            <section key={key} className="news-section">
              <h3>{title}</h3>
              <ul className="plain news-list">
                {news[key].map((item) => (
                  <li key={item.kind}>
                    <button
                      type="button"
                      className="news-item"
                      aria-pressed={selected.has(item.kind)}
                      onClick={() => onToggleKind(item.kind)}
                    >
                      <span className="kind-dot" style={{ background: kindColor(item.col) }} />
                      <span className="news-name">{item.name}</span>
                      <span className="muted small">{describe(item)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
    </div>
  );
}
