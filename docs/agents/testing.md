# Builds und Tests

## Standardbefehle

- `npm test` - `node --test`, inklusive Smoke-Test für `moodle-mcp.js`
- `npm run build:plugin` - nach Änderungen in `Plugin/src/`

## Plugin-Quelle

- PHP-Quelle liegt in `Plugin/src/local_coursepilot/`.
- `Plugin/local_coursepilot.zip` ist generiert und wird nie direkt editiert.
- PHP-Quelle des Servermodell-Plugins liegt in `Plugin/src/local_kurspilot/`
  (Branch `moodle-native-mcp`, Karte
  [#289](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289)).

## PHPUnit für `local_kurspilot`

`local_kurspilot` hat als erstes Kurspilot-Plugin ein Testfundament — der
Datenschutz-Vertrag wird ausschließlich per PHPUnit erzwungen, es gibt keinen
Node-Test für dieses Plugin (Kartenentscheidung
[#300](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/300),
umgesetzt in
[#309](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/309)).

**Ausführung: manuell im Spike-Container**, nicht auf den vier regulären
Devstack-Containern. Die Tests laufen gegen eine eigene Test-Datenbank
(Präfix `t_`) und ein eigenes `phpunitdata` — die restaurierten Daten der
Spike-Instanz werden nicht angefasst.

```bash
# einmalig, und nach jedem Moodle-Upgrade der Spike-Instanz
bash /opt/kurspilot-spike/scripts/phpunit.sh --init

# Testlauf (spiegelt Plugin/src/local_kurspilot vorher in den Bind-Mount)
bash /opt/kurspilot-spike/scripts/phpunit.sh
bash /opt/kurspilot-spike/scripts/phpunit.sh --filter privacy_surface_test
```

Ohne das Skript, direkt:

```bash
set -a; source /opt/kurspilot-spike/docker/kurspilot-spike.env; set +a
/opt/moodle-docker-kurspilot-spike/bin/moodle-docker-compose exec -T webserver \
  vendor/bin/phpunit --testsuite local_kurspilot_testsuite
```

**Nur Moodle 5.0** wird zugesagt (`$plugin->requires = 2025041400`); die
Spike-Instanz läuft auf 5.0.8. Kein Coverage-Gate — das zieht
[#268](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/268)
nach.

### Was die Suite abdeckt

| Datei | Zweck |
|---|---|
| `tests/install_test.php` | Install-Smoke: Version, `requires >= 5.0`, beide Capabilities, externer Dienst |
| `tests/privacy_surface_test.php` | Vertragstest: real **registrierte** Oberfläche ↔ Allowlist ↔ verbotene Namensbestandteile |
| `tests/external/list_courses_test.php` | Je externer Funktion ein Test, plus Capability-Test (`CAPABILITY_MISSING`, keine Daten) |

Der Vertragstest prüft nicht die Repo-Quelle, sondern die auf der laufenden
Instanz registrierte Oberfläche — er fängt damit den Fall, den kein Repo-Test
fangen kann: ein Admin hängt dem Dienst nachträglich eine Funktion an.
Dieselbe Prüffunktion (`\local_kurspilot\privacy_surface::check()`) nutzen
auch die Laufzeit (`mcp.php`) und die Anzeige (`/local/kurspilot/surface.php`).

### Später: CI statt Container

Der manuelle Lauf ist der Stand bis zur Abschaltung des lokalen Kurspiloten.
Mit dem harten Schnitt aus
[#299](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/299)
zieht der Lauf in einen GitHub-Actions-Workflow um. Die Testdateien liegen
deshalb bereits im `moodle-plugin-ci`-tauglichen Standardlayout
(`tests/`, Klassenname = Dateiname, Namensraum = Verzeichnis) — der Umzug ist
dann eine Workflow-Datei, keine Testumschreibung.

## E2E-Tests (Playwright) gegen Testmoodle

Playwright-Specs liegen in `test/e2e/`. Config: `playwright.config.js`.

**Credentials:** `.env.e2e` (gitignored, nicht committen). Enthält:

| Variable | Bedeutung |
|---|---|
| `MOODLE_URL` | Testmoodle-URL |
| `MOODLE_TOKEN` | Webservice-Token für `teacher_edit`-Rolle |
| `MOODLE_TEST_COURSEID` | Kurs-ID des Testkurses |

**Rollenprinzip:** Tests laufen ausschließlich mit `teacher_edit` — kein Admin-Login. Der Token-Benutzer muss im Zielkurs als Editing Teacher eingetragen sein.

**Ausführen:**

```bash
npx playwright test
```

Ohne `.env.e2e` werden Moodle-abhängige Specs übersprungen (Skip, kein Fehler).

**Voraussetzung auf Moodle-Seite:** Das Plugin `local_coursepilot` muss installiert und die Webservices registriert sein (Site administration > Server > Web services > External services). Plugin-Updates auf das Testmoodle deployen und verifizieren: [plugin-deploy.md](../plugin-deploy.md).

## Hook-Checks manuell spiegeln

Codex führt Claude-Hooks nicht zuverlässig automatisch aus. Nach passenden Änderungen manuell ausführen:

- `*.js` geändert -> `node --check <datei>`
- `*.php` geändert -> `php -l <datei>`
- `moodle-mcp.js` oder `test/*.test.js` geändert -> `npm test`
