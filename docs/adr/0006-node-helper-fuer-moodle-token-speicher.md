# Node-Helper fuer den Moodle-Token-Speicher

Der Kollegiums-Installer und das Kurspilot-Installationspaket brauchen einen
sicheren Weg, den persoenlichen Moodle-Webservice-Token einer Lehrkraft lokal zu
speichern und dem MCP-Server nur zur Laufzeit bereitzustellen.

Der bisher dokumentierte Weg ueber `MOODLE_TOKEN` in
`claude_desktop_config.json`, `~/.codex/config.toml`, `.env` oder als
Kommandozeilenargument ist fuer Lehrkraefte zu fehleranfaellig: Tokens koennen
versehentlich in Chats, Screenshots, Repositories oder Support-Anleitungen
landen.

## Optionen

- **Token weiter in MCP-Konfigurationsdateien speichern**: einfach, aber
  unsicher und schwer wartbar. Lehrkraefte muessten Tokens in technischen
  Dateien finden, aendern und pruefen.
- **Separate Windows-/macOS-Skripte als Primaerweg**: kann plattformspezifische
  Schutzmechanismen direkt nutzen, fuehrt aber zu doppelter Doku und
  unterschiedlicher Bedienung fuer Codex und Claude.
- **Node-Helper als kanonische Oberflaeche, intern plattformspezifisch**:
  einheitliche Bedienung und Tests im Repo; der Helper kann unter Windows den
  Credential Manager oder DPAPI-geschuetzte Benutzerablage und unter macOS die
  Keychain nutzen.

## Entscheidung

Wir bauen einen **Node-basierten Credential-Helper** als kanonische Oberflaeche
fuer den Moodle-Token-Speicher.

Der Helper stellt mindestens diese Befehle bereit:

```
node scripts/moodle-credentials.js set
node scripts/moodle-credentials.js update
node scripts/moodle-credentials.js test
node scripts/moodle-credentials.js remove
```

Claude und Codex sollen den MCP-Server nicht direkt mit Klartext-Token
starten. Stattdessen startet ihre MCP-Konfiguration einen lokalen Wrapper oder
Helper, der Moodle-URL und Token aus dem geschuetzten Speicher liest und
`moodle-mcp.js` mit `MOODLE_URL` und `MOODLE_TOKEN` nur fuer den Prozess setzt.

## Plattformstrategie

- **Windows-first**: Der Helper nutzt einen Windows-geeigneten
  Schutzmechanismus, bevorzugt Credential Manager oder eine
  DPAPI-geschuetzte Benutzerablage.
- **macOS**: Der Helper nutzt die Keychain.
- **Andere Plattformen**: Erst nach Bedarf. Ein Klartext-Fallback ist fuer
  Lehrkraft-Setups kein Standardweg.

## Abhaengigkeiten

Neue npm-Laufzeitdependencies bleiben unerwuenscht. Wenn der Helper fuer einen
robusten Credential-Store eine Dependency braucht, wird diese vor Umsetzung
begruendet und separat entschieden.

## Konsequenzen

- README und Installer-Doku zeigen keine Klartext-Token in
  Claude-/Codex-Konfigurationsbeispielen fuer Lehrkraefte.
- #5 (Kollegiums-Installer) verwendet den Helper fuer Token-Erfassung,
  Tokenwechsel und Verbindungstest.
- #51 (Kurspilot-Installationspaket) referenziert denselben Helper fuer Codex-
  und Claude-Adapter.
- Der MCP-Server kann intern vorerst weiter `MOODLE_URL` und `MOODLE_TOKEN` aus
  der Prozessumgebung lesen; die sichere Bereitstellung passiert vor dem
  Prozessstart.
