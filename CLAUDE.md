# MoodleMcp – CLAUDE.md

MCP-Server, der Claude Desktop per stdio mit der Moodle REST API verbindet (`local_aicoursecreator`-Plugin). Fork von [`jtuttas/MoodleMcp`](https://github.com/jtuttas/MoodleMcp), IGS-Arbeitsversion (siehe `docs/adr/0002-...`).

- **Stack:** Node.js (≥18), keine Laufzeit-Dependencies. PHP-Plugin für Moodle 4.x.
- **GitHub:** `matthiasgruenwald/MoodleIGSMcp` (origin), `jtuttas/MoodleMcp` (upstream)
- **Primäre Entwicklungsumgebung:** macOS (lokal). Windows-Tests über Parallels (siehe unten) – kein zweites Repo nötig.

---

## Wichtige Dateien

| Datei/Ordner | Zweck |
|---|---|
| `moodle-mcp.js` | Der gesamte MCP-Server – ein File, Tool-Definitionen + stdio-Loop |
| `Plugin/src/local_aicoursecreator/` | PHP-Plugin-Source (echte Quelle, hier editieren) |
| `Plugin/local_aicoursecreator.zip` | **Generiert** aus `Plugin/src/` via `npm run build:plugin` – nicht direkt editieren |
| `SKILL.md` | Claude-Skill: baut Lernsituationen automatisch in Moodle auf |
| `CONTEXT.md` | Domain-Glossar (Begriffe, Beziehungen, Beispieldialoge) |
| `docs/adr/` | Architekturentscheidungen |
| `docs/prd/` | Produktanforderungen |
| `docs/plans/` | Repo-versionierte Implementierungspläne (lazily, nicht `~/.claude/plans/`) |

---

## Plugin-Workflow

PHP-Source liegt entpackt unter `Plugin/src/local_aicoursecreator/`. Nach Änderungen:

```bash
npm run build:plugin   # baut Plugin/local_aicoursecreator.zip neu
```

Die `.zip` ist das Installationsartefakt für Moodle (siehe README) und bleibt im Repo getrackt – aber nur über `Plugin/src/` editieren, nie direkt im Zip.

---

## Codex/Claude – Begriffsklärung

`CONTEXT.md` definiert **Codex-First** als Produkt-Anforderung: Lehrkräfte müssen den Skill/das Plugin zuverlässig über Codex nutzen können (Zielgruppe Kollegium). Das ist unabhängig davon, womit *hier am Repo entwickelt* wird:

- **Entwicklung:** überwiegend Claude (diese Datei ist kanonisch), teils Codex (`AGENTS.md`, dünner Verweis).
- **Nutzung durch Lehrkräfte:** muss in Codex zuverlässig laufen – bei Änderungen an `SKILL.md`/Plugin-Verhalten immer auch aus Codex-Sicht denken.

---

## Aufgabenhandling

- Vor jedem Edit: Datei lesen. Vor Funktionsänderung: alle Aufrufer grep-en.
- **Code-Sprache:** Bezeichner (Variablen, Funktionen, Kommentare) Englisch oder Deutsch gemischt ist im Bestand vorhanden – bei neuem Code: Bezeichner Englisch, UI-/CLI-sichtbare Strings (Fehlermeldungen, Tool-Beschreibungen für Lehrkräfte) Deutsch.
- Pläne gehören nach `docs/plans/` (versioniert).
- Single-context Repo: `CONTEXT.md` im Root, `docs/adr/` für Architekturentscheidungen, `docs/prd/` für Produktanforderungen.

---

## Git/gh-Workflow

Volle Autonomie: `git add/commit/push`, `gh pr/issue` etc. ohne Rückfrage ausführen, wenn im Rahmen der Aufgabe sinnvoll. Force-Push, History-Rewrite, Branch-Löschung weiterhin nur nach Rückfrage (siehe globale Sicherheitsregeln).

---

## Testing

```bash
npm test          # node --test, u.a. Smoke-Test für moodle-mcp.js
npm run build:plugin
```

`test/smoke.test.js`: prüft, dass der Server startet ("Moodle MCP Server gestartet"), sauber bei stdin-Ende beendet, und ohne `MOODLE_URL`/`MOODLE_TOKEN` mit Fehler abbricht.

### Integrationstests gegen Testmoodle

`test/integration/*.test.js` rufen echte Moodle-Webservices über `test/helpers/moodle-test-client.js` auf. Ohne Konfiguration werden sie automatisch übersprungen (`npm test` bleibt grün).

**Testinstanz einrichten (einmalig):**

1. Moodle-Testinstanz mit `local_aicoursecreator`-Plugin installieren (siehe README, Schritte 1–3: Plugin hochladen, Webservices + REST aktivieren, Token für Dienst `AI Course Creator Service` erstellen).
2. Einen Testkurs anlegen, Kurs-ID aus der URL notieren (`course/view.php?id=X`).
3. `.env.example` nach `.env` kopieren und `MOODLE_URL`, `MOODLE_TOKEN`, `MOODLE_TEST_COURSEID` eintragen. `.env` ist gitignored.
4. `npm test` ausführen – Integrationstests laufen jetzt mit.

---

## Hooks (siehe `.claude/settings.json`)

Nach Edit/Write automatisch:
- `*.js` → `node --check` (Syntax)
- `*.php` → `php -l` (Syntax, Plugin/src)
- `moodle-mcp.js` oder `test/*.test.js` → `npm test`

Codex nutzt diese Hooks nicht automatisch – `.codex/hooks.json` spiegelt dieselbe Logik.

---

## Windows-Testing (Parallels)

Repo liegt in iCloud Drive. Parallels kann den Mac-Ordner als Shared Folder ins Windows-Gast einbinden – kein separates Repo/Checkout auf Windows nötig.

Getestet wird: `moodle-mcp.js` läuft unter Windows-Node + `claude_desktop_config.json` mit Windows-Pfaden (Backslashes, `node`-Aufruf) – siehe README-Setup-Anleitung. Für die Windows-VM: **Claude Desktop** installieren (nicht Claude Code – hier wird nicht entwickelt, nur die Lehrkraft-Konfiguration verifiziert).

---

## Agent skills

### Issue tracker

GitHub Issues im Fork `matthiasgruenwald/MoodleIGSMcp` (origin), via `gh` CLI. Siehe `docs/agents/issue-tracker.md`.

### Triage labels

Standard-Vokabular: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` (1:1-Mapping). Siehe `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` im Root. Siehe `docs/agents/domain.md`.
