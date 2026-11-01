# AGENTS.md: jak v tomto repozitáři pracovat

Pravidla pro AI agenty (Claude Code, Codex, Cursor, ChatGPT…) i pro lidi.
Claude Code tento soubor načte přes [CLAUDE.md](CLAUDE.md).

## Co tu je

- **Původní backend Na ovoce** (Django 2.2, Django REST Framework, PostGIS).
  Na ovoce ho používalo do roku 2022, pak přešlo na
  [Mapotic](https://www.mapotic.com/). Repozitář je archivovaný, viz
  [README.md](README.md).
- **Prototyp funkce „Kdy je co zralé“** na větvi `feature/harvest-seasons`:
  typické sezóny druhů, hlášení zralosti, filtr mapy podle období sklizně
  a sezónní zprávy. Co a proč popisuje [MISSION.md](MISSION.md), připravené
  úkoly jsou v [TODO.md](TODO.md).
- **Prototyp webu** v [web/](web/) (Vite, React, Leaflet) ukazuje funkci
  nad API.

Než začneš, přečti [MISSION.md](MISSION.md). Úkol si vezmi z
[TODO.md](TODO.md), nebo ho dostaneš od člověka.

## Mapa kódu

| Cesta | Co obsahuje |
|---|---|
| `src/harvest/seasons.py` | Čistá logika sezón bez Djanga: typická okna, odhad okna rostliny z hlášení, stav, fáze sezóny, spojování oken |
| `src/harvest/services.py` | Dotazy do databáze nad logikou: filtry mapy, kalendář výřezu, sezóny druhů, sezónní zprávy; `today()` |
| `src/harvest/notifications.py` | Text sezónní zprávy, frekvence, doručení do aplikace a e-mailem |
| `src/harvest/models.py` | `RipenessReport` (hlášení zralosti), `SeasonWatch` (nastavení zpráv) |
| `src/harvest/management/commands/send_season_news.py` | Denní rozesílání (`--date`, `--dry-run`) |
| `src/herbarium/models.py` | `Season`: typická sezóna druhu (část, první měsíc, délka) |
| `src/naovoce/api/v1/harvest/` | API `/api/v1/harvest/…` (kalendář, zprávy, nastavení) |
| `src/naovoce/api/v1/fruit/` | `?month=` a `?ripe=` na seznamu míst, `/fruit/<id>/season/` |
| `src/naovoce/api/v1/users/` | `/users/me/messages/`: zprávy v aplikaci |
| `fixtures/seasons.json` | Typické sezóny 33 druhů |
| `src/locale/cs/LC_MESSAGES/` | České překlady (`django.po` a zkompilované `django.mo`) |
| `tests/api/v1/harvest/` | Testy logiky, API a zpráv |
| `web/src/` | Prototyp rozhraní (`api.ts` je klient API, `seasons.ts` a `filters.ts` jsou čistá logika s testy) |

## Spuštění

### Backend

Základní postup je v [INSTALL.md](INSTALL.md). Na co si dát pozor:

- **Python 3.9.** Django 2.2 a zamčené závislosti
  (`requirements/*.txt`) na novějším Pythonu neběží spolehlivě.
- **PostgreSQL s rozšířeními `postgis` a `hstore`** a knihovny GDAL, GEOS
  a PROJ. Na macOS je dá Homebrew. V Dockeru stačí `python:3.9-slim-bookworm`
  s balíčky `build-essential libpq-dev gdal-bin libgdal-dev libgeos-dev
  libproj-dev libjpeg-dev zlib1g-dev gettext` a obraz `postgis/postgis`.
- **Nastavení:** zkopíruj `src/naovoce/settings/dev_example.py` do
  `src/naovoce/settings/local.py` a doplň databázi. `local.py` v
  `.gitignore` není, takže ho necommituj.
- **Data:**

  ```sh
  src/manage.py migrate
  src/manage.py loaddata fixtures/sites.json fixtures/kinds.json fixtures/seasons.json
  src/manage.py createsuperuser
  src/manage.py runserver
  ```

  Místa přidáš v administraci `/admin/` nebo přes API. Ukázková data
  v repozitáři nejsou.

### Web

```sh
cd web
bun install            # nebo npm install
NAOVOCE_API_ORIGIN=http://127.0.0.1:8000 bun run dev
```

Vite přeposílá `/api`, `/admin`, `/media` a `/static` na backend, takže web
i API běží v prohlížeči na stejném originu. Víc je v
[web/README.md](web/README.md).

## Testy a kontroly

Nástroje se instalují z `requirements/`: pytest z `test.txt`, flake8 z
`lint.txt`, black a isort z `dev.txt`. Před každým commitem musí projít:

```sh
make test     # pytest se settings naovoce.settings.test
make lint     # flake8
make black    # formátování, řádek do 120 znaků
make isort
cd web && bun run check && bun test && bun run build
```

Na co si dát pozor:

- **Testy zapisují do nakonfigurované databáze.** `tests/api/conftest.py`
  přepisuje `django_db_setup` a nahrává fixtures přímo do ní. Použij proto
  samostatnou prázdnou databázi s `postgis` a `hstore`, ne vývojovou.
- **`naovoce.settings.test`** čeká databázi `naovoce2` s uživatelem `test`
  a cesty ke GDAL a GEOS z Homebrew. Jinde si udělej vlastní settings modul,
  který z něj importuje a přepíše databázi a cesty.
- **Testy sezón mají pevné „dnes“:** 20. 6. 2026 přes monkeypatch
  `harvest.services.today`. Kód, který potřebuje dnešní datum, ho bere
  z `services.today()`, ne z `date.today()`.
- **Známá chyba:** dva původní testy `test_fruit_list_difference*` používají
  libfaketime a na Apple Silicon (arm64) padají. S touto funkcí nesouvisí.

## Pravidla pro změny

- **Malé, reviewovatelné kroky.** Jeden úkol z TODO.md je jeden PR. Každá
  změna chování má test.
- **Logika zvlášť od databáze.** Výpočty sezón patří do `seasons.py` jako
  čisté funkce (data dovnitř, výsledek ven), dotazy do `services.py` a views
  zůstávají tenké. Logika se tak dá přenést i mimo tento backend, například
  k Mapoticu.
- **Nerozbíjet API v1.** Mobilní klienti spoléhají na stávající odpovědi.
  Nové věci jsou jen přírůstky: nové endpointy, nové volitelné parametry,
  nová pole.
- **Datumy** bere `services.today()` z `timezone.localdate()` podle
  `TIME_ZONE`, která je v `settings/base.py` nastavená na `UTC`. Pro lidi
  v Česku by byla přesnější `Europe/Prague`. Mediány přes roky se počítají ve
  dnech nepřestupného roku, viz `_season_day` v `seasons.py`.
- **Texty pro lidi** jdou přes `ugettext` nebo `ugettext_lazy` s českým
  překladem v `django.po`. Pak spusť `src/manage.py compilemessages`
  a commitni i `.mo`. Ve webu piš česky a lidem vykej.
- **Migrace:** každá změna modelu má novou migraci. `harvest/0001_initial`
  zatím nikde nasazená není, takže ji do prvního nasazení smíš přegenerovat.
- **Žádné tajné údaje v Gitu:** SMTP, klíče FCM a APNs, privátní klíč VAPID
  ani tokeny. Patří do prostředí nebo do `local.py`.
- **Přístupnost:** barvy textu a tlačítek splňují kontrast WCAG AA. Barvy
  jsou tokeny na začátku `web/src/styles.css` a ovládání musí jít
  z klávesnice.
- **Výkon:** počítej s desítkami tisíc míst. V požadavku nedělej smyčky přes
  všechna místa v Pythonu; agreguj v databázi a výsledky kalendáře a zpráv
  ukládej do mezipaměti.
- **Rozhodnutí patří lidem.** Produktová rozhodnutí, data o sezónách,
  kontakt s Mapoticem a publikaci nech na člověku. Navrhni varianty
  a doporučení.

## Hotovo znamená

1. testy, lint a build prošly;
2. nové chování má test;
3. [MISSION.md](MISSION.md) a tento soubor odpovídají kódu;
4. v PR je napsané, co se změnilo, proč, jak to bylo ověřené a co zůstává.
