import { type FormEvent, useEffect, useState } from "react";
import { type AreaRow, type Bbox, type HarvestAlert, type Kind, type Session, api } from "../api.ts";
import { clampToCzechia } from "../filters.ts";
import { describeStart, describeWindow, kindColor } from "../seasons.ts";

interface Props {
  bbox: Bbox | null;
  kinds: Map<string, Kind>;
  session: Session | null;
  onLogin: () => void;
}

const LEAD_DAYS = [0, 3, 7, 14];

/** "3 dny předem", "7 dní předem", "v den začátku". */
export function leadLabel(days: number): string {
  if (days === 0) return "v den začátku";
  if (days === 1) return "1 den předem";
  return days < 5 ? `${days} dny předem` : `${days} dní předem`;
}

/** Watch the visible part of the map and get notified when a harvest season starts there. */
export function AlertsPanel({ bbox: view, kinds, session, onLogin }: Props) {
  // Alerts watch the visible part of the Czech Republic.
  const bbox = view ? clampToCzechia(view) : null;
  const bboxKey = bbox?.join(",") ?? "";
  const [alerts, setAlerts] = useState<HarvestAlert[] | null>(null);
  const [preview, setPreview] = useState<AreaRow[] | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [leadDays, setLeadDays] = useState(3);
  const [viaEmail, setViaEmail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    api
      .alerts(session)
      .then(setAlerts)
      .catch((reason: Error) => setMessage(reason.message));
  }, [session]);

  // The box is recomputed on every render; its string key changes only with the area.
  useEffect(() => {
    if (!bbox) return;
    let current = true;
    const timer = window.setTimeout(() => {
      api
        .area(bbox)
        .then((rows) => current && (setPreview(rows), setAreaError(null)))
        .catch((reason: Error) => current && (setPreview(null), setAreaError(reason.message)));
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [bboxKey]);

  if (!session) {
    return (
      <div className="alerts">
        <p>
          Označte si kus mapy, klidně celou republiku, a dáme vám vědět, až tam začne sezóna vybraných plodin. Upozornění
          najdete pod zvonečkem v aplikaci, e-mail si můžete zapnout.
        </p>
        <button type="button" className="button" onClick={onLogin}>
          Přihlásit se a hlídat
        </button>
      </div>
    );
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!bbox || !session) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await api.createAlert(
        { name: name.trim() || "Moje oblast", bbox, kinds: [...chosen], lead_days: leadDays, via_email: viaEmail },
        session,
      );
      setAlerts((list) => [created, ...(list ?? [])]);
      setName("");
      setChosen(new Set());
      setMessage("Hlídání je zapnuté.");
    } catch (reason) {
      setMessage(`Nepodařilo se uložit: ${(reason as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(alert: HarvestAlert) {
    if (!session) return;
    const updated = await api.updateAlert(alert.id, { is_active: !alert.is_active }, session);
    setAlerts((list) => list?.map((item) => (item.id === alert.id ? updated : item)) ?? null);
  }

  async function toggleEmail(alert: HarvestAlert) {
    if (!session) return;
    const updated = await api.updateAlert(alert.id, { via_email: !alert.via_email }, session);
    setAlerts((list) => list?.map((item) => (item.id === alert.id ? updated : item)) ?? null);
  }

  async function remove(alert: HarvestAlert) {
    if (!session || !window.confirm(`Opravdu přestat hlídat „${alert.name}“?`)) return;
    await api.deleteAlert(alert.id, session);
    setAlerts((list) => list?.filter((item) => item.id !== alert.id) ?? null);
  }

  return (
    <div className="alerts">
      <form className="card" onSubmit={create}>
        <h3>Hlídat výřez mapy</h3>
        <p className="muted small">
          Hlídá se část České republiky, kterou právě vidíte na mapě. Oddalte ji třeba na celou republiku.
        </p>
        {!bbox && <p className="notice">Posuňte mapu na Českou republiku.</p>}
        {areaError ? (
          <p className="notice">{areaError}</p>
        ) : (
          <>
            <label className="field">
              <span>Název oblasti</span>
              <input
                value={name}
                maxLength={100}
                placeholder="Např. Stromovka"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset className="field">
              <legend>Plodiny (nic nevybráno = všechny v oblasti)</legend>
              {preview === null && <p className="muted small">Načítám, co v oblasti roste…</p>}
              {preview?.length === 0 && <p className="muted small">V tomto výřezu zatím nic nezmapovali.</p>}
              <ul className="plain checklist">
                {preview?.map((row) => {
                  const next = row.windows[0];
                  return (
                    <li key={row.kind}>
                      <label>
                        <input
                          type="checkbox"
                          checked={chosen.has(row.kind)}
                          onChange={(event) => {
                            const copy = new Set(chosen);
                            if (event.target.checked) copy.add(row.kind);
                            else copy.delete(row.kind);
                            setChosen(copy);
                          }}
                        />
                        <span className="kind-dot" style={{ background: kindColor(row.col) }} />
                        {row.name} <span className="muted">({row.count})</span>
                        {next && (
                          <span className="muted small block">
                            {describeWindow(next)} · {describeStart(next)}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <label className="field inline">
              <span>Upozornit</span>
              <select value={leadDays} onChange={(event) => setLeadDays(Number(event.target.value))}>
                {LEAD_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {leadLabel(days)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field inline">
              <input type="checkbox" checked={viaEmail} onChange={(event) => setViaEmail(event.target.checked)} />
              <span>Posílat také e-mailem (jinak jen upozornění v aplikaci)</span>
            </label>
            <button type="submit" className="button" disabled={busy || !bbox || preview === null}>
              Zapnout hlídání
            </button>
          </>
        )}
        {message && <p className="notice">{message}</p>}
      </form>

      <h3>Moje hlídané oblasti</h3>
      {alerts === null && <p className="muted">Načítám…</p>}
      {alerts?.length === 0 && <p className="muted">Zatím nic nehlídáte.</p>}
      <ul className="plain alert-list">
        {alerts?.map((alert) => (
          <li key={alert.id} className={alert.is_active ? "card" : "card inactive"}>
            <div className="alert-head">
              <strong>{alert.name}</strong>
              <span className="muted small">{leadLabel(alert.lead_days)}</span>
            </div>
            <p className="small">
              {alert.kinds.length === 0
                ? "Všechny plodiny v oblasti"
                : alert.kinds.map((key) => kinds.get(key)?.name ?? key).join(", ")}
            </p>
            <ul className="plain small">
              {alert.overview.slice(0, 4).map((row) => (
                <li key={row.kind}>
                  <span className="kind-dot" style={{ background: kindColor(row.col) }} /> {row.name}:{" "}
                  {row.windows[0] ? describeStart(row.windows[0]) : "sezóna neznámá"}
                </li>
              ))}
            </ul>
            <label className="field inline small">
              <input type="checkbox" checked={alert.via_email} onChange={() => toggleEmail(alert)} />
              <span>Také e-mailem</span>
            </label>
            <div className="row">
              <button type="button" className="button ghost" onClick={() => toggle(alert)}>
                {alert.is_active ? "Pozastavit" : "Znovu zapnout"}
              </button>
              <button type="button" className="button ghost danger" onClick={() => remove(alert)}>
                Smazat
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
