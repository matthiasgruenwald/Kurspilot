# MoodleMcp – AGENTS.md

Kontext für Codex. Kanonische Workflow-Doku: [`CLAUDE.md`](CLAUDE.md) – gilt 1:1 auch für Codex-Sessions an diesem Repo.

## Kurzfassung

- **Stack:** Node.js (≥18), keine Dependencies. PHP-Plugin in `Plugin/src/local_aicoursecreator/`.
- **Plugin-Build:** nach Edits in `Plugin/src/` → `npm run build:plugin` (regeneriert `Plugin/local_aicoursecreator.zip`). Nie die `.zip` direkt editieren.
- **Tests:** `npm test` (node --test, Smoke-Test).
- **Vor Edit:** Datei lesen. Vor Funktionsänderung: Aufrufer grep-en.
- **Pläne:** `docs/plans/`, **ADRs:** `docs/adr/`, **PRDs:** `docs/prd/`, **Domain-Glossar:** `CONTEXT.md`.
- **Git/gh:** volle Autonomie (commit/push/pr ohne Rückfrage), außer destruktive Operationen.

## Hooks manuell mirrorn

Codex führt Claude-Hooks (`.claude/settings.json`) nicht automatisch aus. `.codex/hooks.json` enthält dieselbe Logik, falls vom Codex-Setup unterstützt – sonst manuell nach Edits ausführen:

- `*.js` geändert → `node --check <datei>`
- `*.php` geändert → `php -l <datei>`
- `moodle-mcp.js` oder `test/*.test.js` geändert → `npm test`

## Codex-First (Produkt vs. Dev-Tooling)

`CONTEXT.md` definiert **Codex-First** als Anforderung an die *Lehrkraft-Nutzung* (Skill/Plugin müssen in Codex zuverlässig laufen) – nicht als Vorgabe, womit hier am Repo entwickelt wird. Details: [`CLAUDE.md`](CLAUDE.md#codexclaude--begriffsklärung).
