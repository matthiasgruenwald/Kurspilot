# Windows-Installer-Build

Arbeitsnotiz fuer Agenten, damit Windows-Fortsetzungen nicht wieder in dieselben Umgebungsfallen laufen.

## Zielbild

- Echtes Windows-Installer-Artefakt, nicht nur eine ZIP-Datei.
- Nutzerweite Installation ohne Admin-Rechte, soweit praktikabel.
- Payload unter einem nutzerweiten AppData-Pfad, z.B. LOCALAPPDATA/Kurspilot.
- Startmenue/App-Suche zeigt Kurspilot konfigurieren.
- Starter ruft scripts/setup-kurspilot.js mit gebuendelter Node-Laufzeit auf.

## Secret-Speicher

Nicht als Zielzustand verwenden:

- Moodle-Token in Klartextdateien.
- Moodle-Token in Git, .env, Installer-Payload oder Startargumenten.
- Eine selbst verwaltete AppData-Datei als primaerer Secret Store, auch wenn sie mit DPAPI verschluesselt waere.

Passendes Plattform-Mapping:

- macOS: Keychain via security CLI, bestehender Pfad in scripts/moodle-credentials.js.
- Windows: Windows Credential Manager ueber die Credential Management API CredWrite, CredRead, CredDelete mit CRED_TYPE_GENERIC.
- Spaeter Linux, falls noetig: Secret Service/libsecret.

Das entspricht dem Muster plattformuebergreifender Keyring-Bibliotheken: pro Betriebssystem nativer Secret Store, keine gemeinsame Klartext- oder Repo-Datei.

## Windows-Shell-Fallen in dieser Umgebung

Dieses Repo liegt in Parallels/iCloud Shared Foldern. Der gemappte Pfad X:/Schule/IGS/Moodle/MCP funktioniert fuer normale cmd-Aufrufe oft besser als UNC, aber Tool-cwd auf X: oder UNC kann scheitern.

Robuster Aufruf fuer Lese- und Testbefehle: cmd /c mit cd /d X:/Schule/IGS/Moodle/MCP und danach dem eigentlichen node- oder git-Befehl.

Wenn ein Tool mit cwd auf X: oder UNC scheitert, workdir auf C:/Windows setzen und im Befehl per cd /d X:/... wechseln.

Nicht robust:

- Lange node -e writeFileSync Edits durch PowerShell oder cmd.
- Inline-Skripte mit Pipes, Prozentvariablen, Backslashes und verschachtelten Quotes.
- PowerShell-Cmdlets in dieser Codex-Shell voraussetzen. Mehrfach waren Set-Content, New-Object und Write-Host nicht sauber verfuegbar, weil Verschachtelung und Parsing den Befehl zerlegt haben.
- Node-REPL-MCP fuer diesen Pfad. Es scheiterte am Wechsel zwischen UNC und X:.

Fuer Edits bevorzugen:

- apply_patch, wenn der aktuelle Workspace-Pfad fuer das Tool funktioniert.
- Sonst kleine isolierte Schreiboperationen mit vorher/nachher type und node --check.
- Keine grossen Inline-Rewrites ueber verschachtelte Shell-Quotes.

## Tests

Nach Windows-Installer- oder Credential-Aenderungen mindestens:

- node --check scripts/moodle-credentials.js
- node --check scripts/build-windows-installer.js
- node --test test/moodle-credentials.test.js test/start-mcp.test.js test/uninstall-kurspilot.test.js test/setup-browser-server.test.js test/skill-install.test.js test/build-windows-installer.test.js

npm test muss am Ende ebenfalls gruen sein. Vorherige Windows-Laeufe fielen, weil scripts/moodle-credentials.js Windows hart blockierte und nur macOS Keychain unterstuetzte.

## Aktueller Zwischenstand

Es existiert ein erster unvollstaendiger Windows-Build-Schnitt:

- scripts/build-windows-installer.js
- test/build-windows-installer.test.js
- package.json Script build:windows-installer

Der Schnitt baut bisher ein ZIP plus install-kurspilot.ps1. Das ist nicht das gewuenschte Endartefakt. In der naechsten Session ersetzen oder sauber weiterentwickeln. Nicht committen, bevor Credential Store und echtes Installer-Artefakt stimmen und die Windows-Tests gruen sind.
