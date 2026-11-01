# Prototyp webu: Kdy je co zralé

Webové rozhraní, které ukazuje funkci z [MISSION.md](../MISSION.md) nad API
tohoto backendu: mapu jedlých rostlin s panelem Plodiny / Kalendář /
Aktuálně, detail rostliny s hlášením zralosti, sezónní zprávy pod zvonečkem
a jejich nastavení. Vzhled vychází z [mapy Na ovoce](https://map.na-ovoce.cz/).

Je to prototyp, ne náhrada mobilní aplikace. Slouží k vyzkoušení funkce
a jako předloha pro obrazovky v aplikaci.

## Spuštění

Potřebujete běžící backend (viz [AGENTS.md](../AGENTS.md)) a
[Bun](https://bun.sh/) nebo Node.js.

```sh
bun install
NAOVOCE_API_ORIGIN=http://127.0.0.1:8000 bun run dev
```

Vite přeposílá `/api`, `/admin`, `/media` a `/static` na backend
(`NAOVOCE_API_ORIGIN`, výchozí `http://127.0.0.1:8000`). Web a API tak
v prohlížeči sdílejí jeden origin. Přihlášení jde přes `/api/v1/token/`
a token se drží v `localStorage`.

## Kontroly

```sh
bun run check   # TypeScript
bun test        # čistá logika: filtry, sezóny, české tvary slov
bun run build   # produkční build do dist/
```

## Struktura

| Soubor | Co dělá |
|---|---|
| `src/api.ts` | Typy a klient API včetně přihlášení |
| `src/seasons.ts` | Měsíce, popisy sezón, barvy druhů, české tvary slov |
| `src/filters.ts` | Filtry mapy (druhy, měsíc, jen zralé) |
| `src/App.tsx` | Rozvržení: hlavička, panel s kartami, mapa |
| `src/components/` | Mapa, karty panelu, detail rostliny, zvoneček, nastavení zpráv, přihlášení |
| `src/styles.css` | Barevné tokeny (kontrast WCAG AA) a rozvržení pro počítač i telefon |

Mapové podklady jsou z [OpenStreetMap](https://www.openstreetmap.org/copyright).
