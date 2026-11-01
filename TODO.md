# TODO: úkoly připravené pro AI

Funkce „Kdy je co zralé“ je rozdělená do úkolů. Každý úkol obsahuje hotový
prompt, který stačí vložit do Claude Code, Codexu, Cursoru nebo ChatGPT
s přístupem k tomuto repozitáři. Co a proč popisuje
[MISSION.md](MISSION.md), jak v kódu pracovat [AGENTS.md](AGENTS.md).

## Jak začít

1. Otevřete tento repozitář v Claude Code nebo Codexu, případně dejte
   ChatGPT odkaz na repozitář a pull request.
2. Napište:

   ```text
   Přečti AGENTS.md, MISSION.md a TODO.md. Pak udělej úkol 1 z TODO.md
   a na konci mi shrň, co jsi udělal, jak jsi to ověřil a co zbývá.
   ```

3. Po každém úkolu si výsledek prohlédněte a pokračujte dalším. Úkoly 2 a 3
   nepotřebují programátora, jen člověka ze spolku.

Pořadí je doporučené. Úkoly 1–3 dávají smysl vždy. Další záleží na tom,
jakou cestu z MISSION.md zvolíte (Mapotic, doplňková služba, nebo vlastní
vývoj).

---

## 1. Rozběhnout prototyp a projít ho

**Cíl:** prototyp běží lokálně, testy procházejí a vy víte, co PR obsahuje
a jaká má rizika.

```text
Přečti AGENTS.md a MISSION.md. Rozběhni backend i web z větve
feature/harvest-seasons lokálně. Nejjednodušší je Docker Compose (Python 3.9,
PostGIS s rozšířeními postgis a hstore) s oddělenou databází pro testy.
Soubory prostředí dej do složky dev/ a popiš je v AGENTS.md. Nahraj fixtures
sites, kinds a seasons a vytvoř pár desítek ukázkových míst po Česku včetně
hlášení zralosti, ať je co vidět. Spusť testy, lint a build webu. Pak mi
česky a bez programátorských zkratek shrň: jak funkci vyzkouším
v prohlížeči, co funguje, co ne a jaká vidíš rizika.
```

**Hotovo, když:** jedním příkazem se spustí backend i web, všechny testy
kromě dvou známých s libfaketime projdou a existuje srozumitelné shrnutí.

## 2. Ověřit typické sezóny druhů

**Cíl:** sezóny v `fixtures/seasons.json` odpovídají zkušenosti spolku.

```text
Z fixtures/seasons.json a fixtures/kinds.json udělej tabulku pro kontrolu
člověkem: druh, část rostliny, od kterého měsíce, do kterého měsíce a jak
moc si jsi jistý. Nejméně jisté jsou líska, mandloň, hlošina, máta
a meduňka. U každého druhu uveď zdroj, ze kterého údaj vychází. Tabulku ulož
jako docs/harvest-seasons/sezony-ke-kontrole.md. Po kontrole člověkem
promítni opravy zpět do fixtures/seasons.json a spusť testy.
```

**Hotovo, když:** tabulku zkontroloval někdo ze spolku a opravy jsou ve
fixtures.

## 3. Připravit zadání pro Mapotic

**Cíl:** Mapotic dostane srozumitelné zadání a může říct, co z funkce umí
jeho platforma.

```text
Přečti MISSION.md a prohlédni si snímky v docs/harvest-seasons/. Napiš
česky zadání pro Mapotic, který provozuje mapu a mobilní aplikaci Na ovoce:
docs/harvest-seasons/zadani-mapotic.md. Popiš funkci z pohledu uživatele
(typické sezóny kategorií, hlášení zralosti u bodů, filtr podle měsíce,
karta Aktuálně, sezónní zprávy s nastavením a push notifikace i při zavřené
aplikaci). Přidej datový model a pravidla výpočtu ze src/harvest/seasons.py
popsaná slovy a API z MISSION.md jako referenci. Na konec dej seznam otázek
pro Mapotic: co platforma umí sama, co přes API, jak posílá push
notifikace, kolik by stála úprava a jestli jde napojit doplňkovou službu.
Nic si nevymýšlej o tom, co Mapotic umí; co nevíš, polož jako otázku.
```

**Hotovo, když:** spolek může zadání poslat Mapoticu bez dalších úprav.

## 4. Push notifikace

**Cíl:** sezónní zprávy chodí jako push notifikace do telefonu i při
zavřené aplikaci. Na webu volitelně přes Web Push.

```text
Přečti AGENTS.md a MISSION.md (část 6, Upozornění i při zavřené aplikaci).
Přidej do backendu push notifikace pro sezónní zprávy:
- model zařízení uživatele (token, platforma android/ios/web, poslední
  použití) a API /api/v1/users/me/devices/ pro registraci a odhlášení;
- odesílání přes Firebase Cloud Messaging HTTP v1 (Android i iOS přes APNs)
  a volitelně Web Push s VAPID pro web;
- kanál „v aplikaci“ v SeasonWatch posílá zprávu do schránky i jako push;
  neplatné tokeny se po chybě odstraní;
- krátký text notifikace (například „Právě začíná sezóna mirabelek“) a data
  pro otevření mapy s vyfiltrovanou plodinou;
- klíče jen z prostředí, nikdy v Gitu; bez klíčů se push přeskočí
  a zalogují se;
- testy s nahrazeným odesílačem, žádné skutečné volání Firebase v testech.
Ve webu přidej volitelné zapnutí Web Push v nastavení zpráv. Na konci napiš,
co musí udělat člověk: založit projekt Firebase, klíče a nastavení mobilní
aplikace.
```

**Hotovo, když:** testovací zařízení dostane push se sezónní zprávou a
testy pokrývají registraci, odeslání i neplatný token.

## 5. Denní rozesílání a e-mail

**Cíl:** sezónní zprávy se rozesílají samy každé ráno a e-mail je slušný
a jde odhlásit.

```text
Přečti AGENTS.md. Zajisti, aby se příkaz send_season_news spouštěl jednou
denně ráno (cron, systemd timer nebo plánovač hostingu; vyber podle toho,
kde aplikace poběží, a zdůvodni to). Opakovaný běh téhož dne nesmí nic
poslat dvakrát. Přidej test. E-mail sezónní zprávy pošli jako HTML i text
s odkazem na nastavení zpráv a s odhlášením jedním klikem. SMTP údaje ber jen
z prostředí. Ověř to příkazem send_season_news --dry-run a jedním skutečným
e-mailem na testovací adresu.
```

**Hotovo, když:** zprávy chodí samy, nic se nezdvojuje a e-mail jde
odhlásit.

## 6. Skutečná data a výkon

**Cíl:** funkce zvládne všechna místa z celé republiky.

```text
Přečti AGENTS.md. Připrav import míst a druhů z dat spolku Na ovoce: export
z Mapoticu nebo jiný formát, který dodá spolek. Zeptej se, v jakém formátu
data jsou, a nic si nevymýšlej. Pak změř s desítkami tisíc míst odezvu
/api/v1/fruit/?month=, /api/v1/harvest/calendar/ a /api/v1/harvest/news/
a dobu běhu send_season_news. Přidej indexy a mezipaměť (sezóny druhů a
zprávy se mění nejvýš jednou za den) tak, aby každý požadavek trval pod
300 ms. Výsledky měření před a po zapiš do PR.
```

**Hotovo, když:** měření je v PR a všechny požadavky jsou pod limitem.

## 7. Obrazovky v mobilní aplikaci

**Cíl:** funkce je tam, kde ji lidé používají: v mobilní aplikaci.

```text
Přečti MISSION.md a prohlédni si snímky v docs/harvest-seasons/ a prototyp
ve web/. Navrhni obrazovky mobilní aplikace Na ovoce: kartu Kalendář, kartu
Aktuálně, hlášení zralosti v detailu místa, nastavení sezónních zpráv
a otevření mapy z push notifikace. Drž se vzhledu dnešní aplikace. Výstupem
je popis obrazovek a stavů (prázdný stav, nepřihlášený uživatel, chyba sítě)
pro toho, kdo aplikaci vyvíjí, ať je to Mapotic, nebo vlastní tým.
```

**Hotovo, když:** popis obrazovek schválí spolek a předá ho vývojáři
aplikace.

## 8. Přidávání míst ve webu (volitelné)

**Cíl:** v prototypu webu jde přidat nové místo, stejně jako v aplikaci.

```text
Přečti AGENTS.md. Do web/ přidej tlačítko „Přidat značku“: klepnutím do mapy
vyberu místo, zvolím druh, napíšu popis a volitelně přidám fotku. Použij
stávající API pro vytvoření místa a fotky (src/naovoce/api/v1/fruit/ a
images/), nic na backendu neměň. Nepřihlášeného uživatele vyzvi
k přihlášení. Přidej testy čisté logiky a ověř to v prohlížeči.
```

**Hotovo, když:** přihlášený uživatel přidá místo a hned ho vidí na mapě.

## 9. Upgrade na podporované verze

**Cíl:** backend jde bezpečně provozovat. Nutné jen pro cestu „vlastní
vývoj“.

```text
Přečti AGENTS.md. Naplánuj a proveď upgrade z Django 2.2 a Pythonu 3.9 na
aktuální LTS Djanga a podporovaný Python. Postupuj po krocích (2.2 → 3.2 →
4.2 → 5.2) a po každém spusť testy. Nahraď ugettext za gettext, aktualizuj
závislosti v requirements/*.in a přegeneruj *.txt. U přihlášení přes
Facebook ověř, jestli ještě funguje, a pokud ne, navrhni, co s ním. Každý
krok udělej jako samostatný commit.
```

**Hotovo, když:** testy procházejí na podporovaných verzích a v PR je
seznam změn chování.

## 10. Opravit testy s libfaketime na Apple Silicon

**Cíl:** celá testovací sada projde i na počítačích s arm64.

```text
Přečti AGENTS.md. Testy test_fruit_list_difference* používají libfaketime,
které na Apple Silicon (arm64) nefunguje. Nahraď ho zmrazením času v Pythonu
(freezegun nebo time-machine), aby testy prošly všude. Chování testů se nesmí
změnit.
```

**Hotovo, když:** `make test` projde celé na Intelu i na Apple Silicon.
