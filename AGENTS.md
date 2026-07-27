# Kurspilot

Kurspilot ist ein Node.js-MCP-Server mit Moodle-Plugin, der Codex/Claude per stdio mit der Moodle-REST-API verbindet.

## Immer relevant

- Kanonische Workflow-Doku: [CLAUDE.md](CLAUDE.md)
- Vor jedem Edit Datei lesen; vor Funktionsänderungen alle Aufrufer suchen.
- Kleine, fokussierte Dateien bevorzugen. Bewusst große Entrypoints wie `moodle-mcp.js` nur entlang bestehender ADRs aufteilen.

## Befehle

- `npm test` - Smoke-Tests für den Server
- `npm run build:plugin` - nach Änderungen in `Plugin/src/`; regeneriert `Plugin/local_coursepilot.zip`

## Mehr Kontext

- [docs/agents/workflow.md](docs/agents/workflow.md)
- [docs/agents/testing.md](docs/agents/testing.md)
- [docs/agents/domain.md](docs/agents/domain.md)
- [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- [docs/agents/triage-labels.md](docs/agents/triage-labels.md)
