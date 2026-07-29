# Plugin-Deploy auf das Testmoodle

Schritt-für-Schritt-Anleitung, um Änderungen in `Plugin/src/local_coursepilot/`
auf das Testmoodle zu deployen und zu verifizieren. Enthält keine Secrets —
Zugangsdaten liegen ausschließlich in gitignored `.env`-Dateien (siehe unten).

## Überblick

Der Deploy ist rsync-basiert, nicht Zip-Upload:

1. PHP-Quellen in `Plugin/src/local_coursepilot/` ändern
2. `bash scripts/deploy-plugin.sh` ausführen
   - rsync der Quellen auf den LXC (`moodle-deploy@1.2.3.31:/opt/moodle/local/coursepilot/`)
   - führt danach automatisch `admin/cli/upgrade.php --non-interactive` im
     Moodle-Container aus (Registrierung neuer/geänderter Webservices, DB-Upgrade)
3. Verifizieren (Playwright-E2E oder manueller Token-Check)

## Voraussetzungen (einmalig)

| Was | Wo |
|---|---|
| SSH-Keypair für Deploy | privat: `~/.ssh/id_moodle_deploy`, öffentlich im LXC-User `moodle-deploy` hinterlegt |
| LXC erreichbar | `ssh -i ~/.ssh/id_moodle_deploy moodle-deploy@1.2.3.31` |
| Moodle-Container | `moodle-docker-webserver-1` (wird vom Skript per `docker exec` angesprochen) |
| Webservice-Token | `.env.e2e` → `MOODLE_TOKEN` (Rolle `teacher_edit`), siehe [agents/testing.md](agents/testing.md) |

Fehlt der SSH-Key: neues Keypair erzeugen, öffentlichen Teil an
`moodle-deploy@1.2.3.31:~/.ssh/authorized_keys` anhängen, Dateirechte `600`/`700`
auf dem LXC prüfen.

## Deploy-Workflow

```bash
# 1. Quellen ändern, lokal syntaxprüfen
php -l Plugin/src/local_coursepilot/classes/external/<datei>.php

# 2. Deploy + automatisches upgrade.php
bash scripts/deploy-plugin.sh
```

Das Skript beendet sich bei Fehlern selbst (`set -e`). Erfolgreicher Lauf endet
mit `Deploy abgeschlossen.`

### Webservices registrieren

`upgrade.php` registriert neue Funktionen aus `db/services.php` automatisch.
Ein manuelles Nachregistrieren ist nur nötig, wenn Funktionen außerhalb eines
Upgrades umbenannt wurden:

- Moodle-UI: *Website-Administration → Server → Webservices → Externe Dienste*
  → Dienst `coursepilot_service` → *Funktionen hinzufügen*.
- Token prüfen (ersetzt Werte aus `.env.e2e`, niemals committen):

```bash
source .env.e2e
curl -s "$MOODLE_URL/webservice/rest/server.php" \
  --data-urlencode "wstoken=$MOODLE_TOKEN" \
  --data-urlencode "wsfunction=core_webservice_get_site_info" \
  --data-urlencode "moodlewsrestformat=json" | head -c 300
```

Erwartet: JSON mit `"sitename"` und Funktionsliste. Ein `"errorcode"` deutet auf
abgelaufenen/fehlenden Token oder nicht aktivierte Protokolle (REST unter
*Webservices → Übersicht* aktiviert?).

## Verifizieren per Playwright

Voraussetzung: `.env.e2e` mit `MOODLE_URL`, `MOODLE_TOKEN`, `MOODLE_TEST_COURSEID`
(siehe [agents/testing.md](agents/testing.md)). Ohne die Datei werden
Moodle-Specs übersprungen.

```bash
npx playwright test
```

Nach Deploy + grünem E2E-Lauf ist das Plugin-Update verifiziert.

## Umgebung / Secrets

| Datei | Status | Inhalt |
|---|---|---|
| `scripts/deploy-plugin.sh` | im Git, keine Secrets | LXC-Host, Pfade, Container-Name sind hier die Single Source of Truth |
| `.env.e2e` | gitignored (`.gitignore`: `.env.*`) | `MOODLE_URL`, `MOODLE_TOKEN`, `MOODLE_TEST_COURSEID` |
| `.env.plugin-deploy` | gitignored, optional | lokale Notizen/Overrides zu Deploy-Parametern; Template: `.env.plugin-deploy.example` |

Das Deploy-Skript liest aktuell keine `.env`-Datei — die Verbindung ist fest im
Skript konfiguriert. `.env.plugin-deploy.example` dokumentiert die Parameter als
Referenz, falls Deploy-Automatisierung (z. B. CI) sie später parametrisieren will.

## Dokumentierter Dry-Run

Ausgeführt am 2026-07-29 von diesem Arbeitsverzeichnis, unveränderte Quellen
(idempotenter Re-Sync als Workflow-Test):

```
$ bash scripts/deploy-plugin.sh
Transfer starting: 49 files
./
classes/
classes/external/

sent 2595 bytes  received 38 bytes  31684 bytes/sec
total size is 295609  speedup is 112.27
Für die installierte Version 5.0.8 (Build: 20260608) (2025041408) ist kein Upgrade notwendig.

Deploy abgeschlossen.
```

Ergebnis: rsync überträgt nur Deltas, `upgrade.php` erkennt „kein Upgrade
notwendig“, Skript endet sauber. Token-Check und `npx playwright test` liefen
zuvor grün gegen denselben Stand.
