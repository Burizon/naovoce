import { useCallback, useEffect, useMemo, useState } from "react";
import { type Bbox, type FruitMarker, type Kind, type Session, api, loadSession, saveSession } from "./api.ts";
import { AlertsPanel } from "./components/AlertsPanel.tsx";
import { FruitPanel } from "./components/FruitPanel.tsx";
import { HarvestCalendar } from "./components/HarvestCalendar.tsx";
import { LoginDialog } from "./components/LoginDialog.tsx";
import { MapView } from "./components/MapView.tsx";
import { MonthBar } from "./components/MonthBar.tsx";
import { MONTHS } from "./seasons.ts";

type Tab = "calendar" | "alerts";

export function App() {
  const [kinds, setKinds] = useState<Map<string, Kind>>(new Map());
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1);
  const [ripeOnly, setRipeOnly] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const [markers, setMarkers] = useState<FruitMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [session, setSession] = useState<Session | null>(loadSession);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    api
      .kinds()
      .then((list) => setKinds(new Map(list.map((item) => [item.key, item]))))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    api
      .fruit({ month, ripe: ripeOnly, kind })
      .then((list) => current && (setMarkers(list), setError(null)))
      .catch((reason: Error) => current && setError(`Mapu se nepodařilo načíst: ${reason.message}`))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [month, ripeOnly, kind]);

  const changeSession = useCallback((next: Session | null) => {
    saveSession(next);
    setSession(next);
  }, []);

  const requireLogin = useCallback(() => setLoginOpen(true), []);

  const summary = useMemo(() => {
    const what = kind ? (kinds.get(kind)?.name ?? kind) : "Všechny druhy";
    const when = ripeOnly ? "nahlášené jako zralé" : month ? `sklizeň v měsíci ${MONTHS[month - 1]}` : "celý rok";
    return `${what} · ${when} · ${markers.length.toLocaleString("cs-CZ")} míst`;
  }, [kind, kinds, month, ripeOnly, markers.length]);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Na ovoce">
          <span className="brand-mark" aria-hidden="true">
            ➶
          </span>
          <span className="brand-name">
            na
            <br />
            ovoce
          </span>
        </a>
        <div className="topbar-title">
          <strong>Kdy je co zralé</strong>
          <span>Sezóny sklizně na mapě jedlých rostlin</span>
        </div>
        <div className="topbar-user">
          {session ? (
            <>
              <span className="muted">{session.username}</span>
              <button type="button" className="button ghost" onClick={() => changeSession(null)}>
                Odhlásit
              </button>
            </>
          ) : (
            <button type="button" className="button" onClick={requireLogin}>
              Přihlásit se
            </button>
          )}
        </div>
      </header>

      <MonthBar
        month={month}
        ripeOnly={ripeOnly}
        onMonth={(value) => {
          setMonth(value);
          setRipeOnly(false);
        }}
        onRipeOnly={setRipeOnly}
      />

      <main className="layout">
        <section className="map-area" aria-label="Mapa">
          <MapView
            markers={markers}
            kinds={kinds}
            highlightRipe={ripeOnly}
            selected={selected}
            onSelect={setSelected}
            onBounds={setBbox}
          />
          <div className="map-summary" role="status">
            {loading ? "Načítám mapu…" : (error ?? summary)}
            {kind && (
              <button type="button" className="chip-clear" onClick={() => setKind(null)}>
                zrušit filtr druhu ×
              </button>
            )}
          </div>
        </section>

        <aside className="panel">
          {selected !== null ? (
            <FruitPanel
              key={selected}
              fruitId={selected}
              kinds={kinds}
              session={session}
              onLogin={requireLogin}
              onClose={() => setSelected(null)}
            />
          ) : (
            <>
              <nav className="tabs" aria-label="Panel">
                <button type="button" aria-pressed={tab === "calendar"} onClick={() => setTab("calendar")}>
                  Kalendář sklizně
                </button>
                <button type="button" aria-pressed={tab === "alerts"} onClick={() => setTab("alerts")}>
                  Hlídání sezóny
                </button>
              </nav>
              {tab === "calendar" ? (
                <HarvestCalendar
                  bbox={bbox}
                  month={month}
                  selectedKind={kind}
                  onMonth={setMonth}
                  onKind={(value) => setKind(value === kind ? null : value)}
                />
              ) : (
                <AlertsPanel bbox={bbox} kinds={kinds} session={session} onLogin={requireLogin} />
              )}
            </>
          )}
        </aside>
      </main>

      {loginOpen && (
        <LoginDialog
          onClose={() => setLoginOpen(false)}
          onSession={(next) => {
            changeSession(next);
            setLoginOpen(false);
          }}
        />
      )}
    </div>
  );
}
