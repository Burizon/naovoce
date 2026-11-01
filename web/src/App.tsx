import { useCallback, useEffect, useMemo, useState } from "react";
import { type Bbox, type FruitMarker, type Kind, type Session, api, loadSession, saveSession } from "./api.ts";
import { AlertsPanel } from "./components/AlertsPanel.tsx";
import { FilterChips } from "./components/FilterChips.tsx";
import { FruitPanel } from "./components/FruitPanel.tsx";
import { HarvestCalendar } from "./components/HarvestCalendar.tsx";
import { KindPanel } from "./components/KindPanel.tsx";
import { LoginDialog } from "./components/LoginDialog.tsx";
import { MapView } from "./components/MapView.tsx";
import { NotificationBell } from "./components/NotificationBell.tsx";
import { type Filters, NO_FILTERS, countByKind, kindTiles, toggleKind, visibleMarkers } from "./filters.ts";

type Tab = "plants" | "calendar" | "alerts";

const TABS: { id: Tab; label: string }[] = [
  { id: "plants", label: "Plodiny" },
  { id: "calendar", label: "Kalendář sklizně" },
  { id: "alerts", label: "Hlídání sezóny" },
];

export function App() {
  const [kinds, setKinds] = useState<Map<string, Kind>>(new Map());
  // The whole map without filters is the starting point.
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [markers, setMarkers] = useState<FruitMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [tab, setTab] = useState<Tab>("plants");
  const [panelOpen, setPanelOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<Session | null>(loadSession);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    api
      .kinds()
      .then((list) => setKinds(new Map(list.map((item) => [item.key, item]))))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  // Month and "ripe now" are answered by the API; kinds are filtered here so tiles keep their counts.
  useEffect(() => {
    let current = true;
    setLoading(true);
    api
      .fruit({ month: filters.month, ripe: filters.ripeOnly })
      .then((list) => current && (setMarkers(list), setError(null)))
      .catch((reason: Error) => current && setError(`Mapu se nepodařilo načíst: ${reason.message}`))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [filters.month, filters.ripeOnly]);

  const counts = useMemo(() => countByKind(markers), [markers]);
  const tiles = useMemo(() => kindTiles(kinds, counts, search), [kinds, counts, search]);
  const shown = useMemo(() => visibleMarkers(markers, filters), [markers, filters]);

  const changeSession = useCallback((next: Session | null) => {
    saveSession(next);
    setSession(next);
  }, []);
  const requireLogin = useCallback(() => setLoginOpen(true), []);

  function select(id: number) {
    setSelected(id);
    setPanelOpen(true);
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="icon-button menu"
          aria-label={panelOpen ? "Skrýt panel" : "Zobrazit panel"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          ☰
        </button>
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
        <span className="topbar-title">Kdy je co zralé</span>
        <label className="search">
          <span className="sr-only">Hledat plodinu</span>
          <input
            type="search"
            placeholder="Hledat plodinu"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(null);
              setTab("plants");
              setPanelOpen(true);
            }}
          />
        </label>
        <div className="topbar-user">
          {session ? (
            <>
              <NotificationBell session={session} />
              <span className="muted user-name">{session.username}</span>
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

      <main className={panelOpen ? "layout" : "layout panel-closed"}>
        <aside className="panel" aria-label="Panel mapy" hidden={!panelOpen}>
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
              <nav className="tabs" aria-label="Části panelu">
                {TABS.map((item) => (
                  <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
                    {item.label}
                  </button>
                ))}
              </nav>
              {tab === "plants" && (
                <KindPanel
                  tiles={tiles}
                  counts={counts}
                  total={shown.length}
                  selected={filters.kinds}
                  month={filters.month}
                  ripeOnly={filters.ripeOnly}
                  search={search}
                  onToggle={(key) => setFilters(toggleKind(filters, key))}
                />
              )}
              {tab === "calendar" && (
                <>
                  <div className="calendar-toolbar">
                    <button
                      type="button"
                      className="toggle"
                      aria-pressed={filters.ripeOnly}
                      onClick={() => setFilters({ ...filters, ripeOnly: !filters.ripeOnly })}
                      title="Místa, která lidé v posledních 10 dnech nahlásili jako zralá"
                    >
                      <span className="dot ripe" aria-hidden="true" /> Teď zralé podle hlášení
                    </button>
                    <button
                      type="button"
                      className="toggle"
                      aria-pressed={filters.month === null && !filters.ripeOnly}
                      onClick={() => setFilters({ ...filters, month: null, ripeOnly: false })}
                    >
                      Celý rok
                    </button>
                  </div>
                  <HarvestCalendar
                    bbox={bbox}
                    month={filters.month}
                    selectedKinds={filters.kinds}
                    onMonth={(month) =>
                      setFilters({ ...filters, ripeOnly: false, month: month === filters.month ? null : month })
                    }
                    onKind={(key) => setFilters(toggleKind(filters, key))}
                  />
                </>
              )}
              {tab === "alerts" && (
                <AlertsPanel bbox={bbox} kinds={kinds} session={session} onLogin={requireLogin} />
              )}
            </>
          )}
        </aside>

        <section className="map-area" aria-label="Mapa">
          <MapView
            markers={shown}
            kinds={kinds}
            highlightRipe={filters.ripeOnly}
            selected={selected}
            onSelect={select}
            onBounds={setBbox}
          />
          <FilterChips filters={filters} kinds={kinds} onChange={setFilters} />
          {(loading || error) && (
            <div className="map-status" role="status">
              {error ?? "Načítám mapu…"}
            </div>
          )}
        </section>
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
