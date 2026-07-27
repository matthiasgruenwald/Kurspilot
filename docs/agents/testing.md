# Builds und Tests

## Standardbefehle

- `npm test` - `node --test`, inklusive Smoke-Test für `moodle-mcp.js`
- `npm run build:plugin` - nach Änderungen in `Plugin/src/`

## Plugin-Quelle

- PHP-Quelle liegt in `Plugin/src/local_coursepilot/`.
- `Plugin/local_coursepilot.zip` ist generiert und wird nie direkt editiert.

## Hook-Checks manuell spiegeln

Codex führt Claude-Hooks nicht zuverlässig automatisch aus. Nach passenden Änderungen manuell ausführen:

- `*.js` geändert -> `node --check <datei>`
- `*.php` geändert -> `php -l <datei>`
- `moodle-mcp.js` oder `test/*.test.js` geändert -> `npm test`

## Windows-Installer

- Vor Arbeit am Installer immer [windows-installer-build.md](./windows-installer-build.md) lesen.
