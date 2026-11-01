import { type FormEvent, useEffect, useState } from "react";
import {
  type Bbox,
  type FrequencyDays,
  type Kind,
  type LeadDays,
  type SeasonWatchInput,
  type Session,
  api,
} from "../api.ts";
import { kindColor, plural } from "../seasons.ts";

interface Props {
  session: Session;
  kinds: Map<string, Kind>;
  bbox: Bbox | null;
  onClose: () => void;
}

const LEADS: { value: LeadDays; label: string }[] = [
  { value: 14, label: "14 dní" },
  { value: 30, label: "měsíc" },
  { value: 60, label: "dva měsíce" },
];

const FREQUENCIES: { value: FrequencyDays; label: string }[] = [
  { value: 7, label: "každý týden" },
  { value: 14, label: "každých 14 dní" },
  { value: 30, label: "každý měsíc" },
];

/** Season news settings: followed kinds, how far ahead, how often and where. */
export function SettingsDialog({ session, kinds, bbox, onClose }: Props) {
  const [form, setForm] = useState<SeasonWatchInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .watch(session)
      .then(({ last_sent: _lastSent, ...input }) => setForm(input))
      .catch((reason: Error) => setError(reason.message));
  }, [session]);

  const allKinds = [...kinds.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));

  async function fromMap() {
    if (!bbox || !form) return;
    const rows = await api.calendar(bbox);
    setForm({ ...form, kinds: rows.filter((row) => row.count > 0).map((row) => row.kind) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveWatch(form, session);
      onClose();
    } catch (reason) {
      setError(`Nastavení se nepodařilo uložit: ${(reason as Error).message}`);
      setBusy(false);
    }
  }

  function toggle(key: string) {
    if (!form) return;
    const chosen = new Set(form.kinds);
    if (chosen.has(key)) chosen.delete(key);
    else chosen.add(key);
    setForm({ ...form, kinds: [...chosen] });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="settings-title">Sezónní zprávy</h2>
        <p className="muted small">
          Pravidelně vám pošleme přehled, co začíná, probíhá a končí, a co lidé hlásí jako zralé.
        </p>

        {!form ? (
          <p className="muted">{error ?? "Načítám nastavení…"}</p>
        ) : (
          <>
            <fieldset className="field">
              <legend>Plodiny</legend>
              <div className="row small-actions">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setForm({ ...form, kinds: allKinds.map((kind) => kind.key) })}
                >
                  Vybrat vše
                </button>
                <button type="button" className="link-button" onClick={() => setForm({ ...form, kinds: [] })}>
                  Zrušit výběr
                </button>
                <button type="button" className="link-button" onClick={fromMap} disabled={!bbox}>
                  Plodiny z výřezu mapy
                </button>
              </div>
              <p className="muted small">
                {form.kinds.length === 0
                  ? "Nic nevybráno: posíláme zprávy o všech plodinách."
                  : `Vybráno: ${plural(form.kinds.length, "plodina", "plodiny", "plodin")}.`}
              </p>
              <ul className="plain kind-checklist">
                {allKinds.map((kind) => (
                  <li key={kind.key}>
                    <label>
                      <input type="checkbox" checked={form.kinds.includes(kind.key)} onChange={() => toggle(kind.key)} />
                      <span className="kind-dot" style={{ background: kindColor(kind.col) }} />
                      {kind.name}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <fieldset className="field">
              <legend>Upozornit na začátek sezóny předem</legend>
              <div className="segmented">
                {LEADS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={form.lead_days === value}
                    onClick={() => setForm({ ...form, lead_days: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend>Jak často posílat</legend>
              <div className="segmented">
                {FREQUENCIES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={form.frequency_days === value}
                    onClick={() => setForm({ ...form, frequency_days: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend>Kam</legend>
              <label className="field inline">
                <input
                  type="checkbox"
                  checked={form.via_app}
                  onChange={(event) => setForm({ ...form, via_app: event.target.checked })}
                />
                <span>V aplikaci (zvoneček a vyskakovací okno)</span>
              </label>
              <label className="field inline">
                <input
                  type="checkbox"
                  checked={form.via_email}
                  onChange={(event) => setForm({ ...form, via_email: event.target.checked })}
                />
                <span>E-mailem</span>
              </label>
              {!form.via_app && !form.via_email && (
                <p className="notice small">Sezónní zprávy jsou vypnuté.</p>
              )}
            </fieldset>

            {error && <p className="notice">{error}</p>}
            <div className="row">
              <button type="submit" className="button" disabled={busy}>
                Uložit
              </button>
              <button type="button" className="button ghost" onClick={onClose}>
                Zrušit
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
