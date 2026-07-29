# Builds und Tests

## Standardbefehle

- `npm test` - `node --test`, inklusive Smoke-Test für `moodle-mcp.js`
- `npm run build:plugin` - nach Änderungen in `Plugin/src/`

## Plugin-Quelle

- PHP-Quelle liegt in `Plugin/src/local_coursepilot/`.
- `Plugin/local_coursepilot.zip` ist generiert und wird nie direkt editiert.

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

**Voraussetzung auf Moodle-Seite:** Das Plugin `local_coursepilot` muss installiert und die Webservices registriert sein (Site administration > Server > Web services > External services).

## Hook-Checks manuell spiegeln

Codex führt Claude-Hooks nicht zuverlässig automatisch aus. Nach passenden Änderungen manuell ausführen:

- `*.js` geändert -> `node --check <datei>`
- `*.php` geändert -> `php -l <datei>`
- `moodle-mcp.js` oder `test/*.test.js` geändert -> `npm test`
