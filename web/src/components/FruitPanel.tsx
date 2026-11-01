import { useEffect, useState } from "react";
import { type FruitDetail, type FruitSeason, type Kind, type RipenessState, type Session, api } from "../api.ts";
import {
  MONTHS_SHORT,
  SOURCE_LABEL,
  STATUS_LABEL,
  daysUntil,
  describeTypical,
  describeWindow,
  kindColor,
  shortDate,
  typicalMonths,
} from "../seasons.ts";

interface Props {
  fruitId: number;
  kinds: Map<string, Kind>;
  session: Session | null;
  onLogin: () => void;
  onClose: () => void;
}

const VOTES: { state: RipenessState; label: string; hint: string }[] = [
  { state: "ripe", label: "Je zralé", hint: "Dá se sklízet" },
  { state: "unripe", label: "Ještě ne", hint: "Plody jsou zatím nezralé" },
  { state: "over", label: "Už je po sezóně", hint: "Otrhané nebo opadané" },
];

const STATE_LABEL: Record<RipenessState, string> = { ripe: "zralé", unripe: "nezralé", over: "po sezóně" };

/** Detail of one plant: when it ripens and a place to report its ripeness today. */
export function FruitPanel({ fruitId, kinds, session, onLogin, onClose }: Props) {
  const [detail, setDetail] = useState<FruitDetail | null>(null);
  const [season, setSeason] = useState<FruitSeason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.fruitDetail(fruitId).then(setDetail).catch(() => setDetail(null));
    api
      .season(fruitId)
      .then(setSeason)
      .catch((reason: Error) => setMessage(reason.message));
  }, [fruitId]);

  const kind = kinds.get(season?.kind ?? detail?.kind ?? "");
  const months = typicalMonths(season?.typical ?? []);
  const nowMonth = new Date().getMonth() + 1;

  async function vote(state: RipenessState) {
    if (!session) {
      onLogin();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setSeason(await api.report(fruitId, state, note, session));
      setNote("");
      setMessage("Děkujeme, hlášení je uložené.");
    } catch (reason) {
      setMessage(`Hlášení se nepodařilo uložit: ${(reason as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="fruit-panel">
      <header className="panel-header">
        <span className="kind-dot large" style={{ background: kind ? kindColor(kind.col) : undefined }} />
        <div>
          <h2>{kind?.name ?? "Rostlina"}</h2>
          {detail?.user && <p className="muted">Zmapoval(a) {detail.user.username}</p>}
        </div>
        <button type="button" className="icon-button" aria-label="Zavřít detail" onClick={onClose}>
          ×
        </button>
      </header>

      {detail?.description && <p className="description">{detail.description}</p>}

      {season ? (
        <>
          <section className={`status status-${season.status}`}>
            <strong>{STATUS_LABEL[season.status]}</strong>
            {season.predicted && (
              <span>
                {daysUntil(season.predicted.end) < 0 ? "Letos už proběhlo: " : "Letos "}
                {season.predicted.part ? `${season.predicted.part} ` : ""}
                {describeWindow(season.predicted)}, {SOURCE_LABEL[season.predicted.source]}
              </span>
            )}
          </section>

          <section>
            <h3>Typická sezóna</h3>
            <div className="month-strip" aria-label="Měsíce typické sklizně">
              {MONTHS_SHORT.map((label, index) => (
                <span
                  key={label}
                  className={[
                    "month-cell",
                    months.has(index + 1) ? "on" : "",
                    index + 1 === nowMonth ? "now" : "",
                  ].join(" ")}
                  style={months.has(index + 1) && kind ? { background: kindColor(kind.col) } : undefined}
                  title={label}
                >
                  {label.slice(0, 1)}
                </span>
              ))}
            </div>
            <ul className="plain">
              {season.typical.length === 0 && <li className="muted">Typická sezóna druhu zatím chybí.</li>}
              {season.typical.map((item) => (
                <li key={item.part}>
                  {item.part}: {describeTypical(item)}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Jak je to s tímto stromem?</h3>
            <p className="muted small">
              Vaše hlášení zpřesní, kdy tato konkrétní rostlina dozrává. Z hlášení let minulých odhadneme sezónu na
              příští rok.
            </p>
            <div className="votes">
              {VOTES.map((item) => (
                <button
                  key={item.state}
                  type="button"
                  className={`vote vote-${item.state}`}
                  disabled={busy}
                  title={item.hint}
                  onClick={() => vote(item.state)}
                >
                  {item.label}
                  <span className="count">{season.recent_votes[item.state] || ""}</span>
                </button>
              ))}
            </div>
            <label className="field">
              <span>Poznámka (nepovinná)</span>
              <input
                value={note}
                maxLength={280}
                placeholder="Např. spodní větve už otrhané"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {!session && <p className="muted small">Pro hlášení se přihlaste.</p>}
            {message && <p className="notice">{message}</p>}
          </section>

          {season.observed.length > 0 && (
            <section>
              <h3>Zralé v minulých letech</h3>
              <ul className="plain">
                {season.observed
                  .slice()
                  .reverse()
                  .map((year) => (
                    <li key={year.year}>
                      <strong>{year.year}</strong>: {shortDate(year.first_ripe)} – {shortDate(year.last_ripe)}{" "}
                      <span className="muted">
                        ({year.reports}× od {year.reporters} lidí)
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {season.reports.length > 0 && (
            <section>
              <h3>Poslední hlášení</h3>
              <ul className="plain reports">
                {season.reports.slice(0, 8).map((report) => (
                  <li key={report.id}>
                    <span className={`dot ${report.state}`} aria-hidden="true" /> {shortDate(report.observed_on)}{" "}
                    {report.observed_on.slice(0, 4)} · {STATE_LABEL[report.state]} · {report.author}
                    {report.note && <span className="muted"> — {report.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="muted">{message ?? "Načítám sezónu…"}</p>
      )}
    </article>
  );
}
