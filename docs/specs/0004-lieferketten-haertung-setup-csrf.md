# Spezifikation: Sicherheits-Härtung vor Veröffentlichung

> Zugehöriges Tracking-Issue: #193.
> Ergebnis des Security-Reviews vom 2026-07-27 (VERIFY-001, VERIFY-002, VERIFY-003).

## Problem Statement

Das Security-Review vor Veröffentlichung hat drei Härtungslücken identifiziert:

1. Der lokale Setup-Server (`lib/setup-browser-server.js`) hat keinen CSRF-Schutz. Ein bösartiger Browser-Tab könnte theoretisch POST-Requests an `127.0.0.1:<port>` senden und Setup-Aktionen auslösen (Konfiguration ändern, Updates installieren).

2. Die Bootstrap-Skripte (`setup.sh`, `setup.ps1`) und `lib/app-provision.js` laden den GitHub-Tarball vom `main`-Branch ohne Integritätsprüfung. Ein kompromittiertes Repository (verschobener Tag/Branch) oder ein manipulierter Download würde stillschweigend ausgeführt.

3. Das Moodle-Plugin akzeptiert den MIME-Type beim Datei-Upload vom Client (PARAM_RAW), ohne ihn gegen den tatsächlichen Dateiinhalt zu prüfen. Ein falscher MIME könnte dazu führen, dass Moodle eine Datei mit einem anderen Content-Type serviert als beabsichtigt.

## Solution

1. Der Setup-Server generiert beim Start ein einmaliges Bearer-Token (16 Byte Hex), das in der Terminal-URL sichtbar bleibt (`http://127.0.0.1:<port>/?token=<hex>`). Alle POST-Handler und GET-Seiten-Requests prüfen den Token per Query-Parameter. Ohne gültigen Token: 403. Der Komfort (klickbare URL im Terminal, Tab erneut öffnen) bleibt erhalten.

2. **Abweichende Vertriebsentscheidung (2026-08-04):** Der Lehrkraft-Installationsweg folgt auf ausdrücklichen Wunsch direkt `main`. `APP_TARBALL_URL`, `setup.sh` und `setup.ps1` laden daher den aktuellen `main`-Tarball und prüfen keinen festen SHA256-Wert, weil dieser mit einem beweglichen Branch unvereinbar wäre. Damit ist das GitHub-Repository samt TLS-Verbindung die Vertrauensgrenze. Ein späterer prüfsummenfixierter Release-Kanal bleibt eine mögliche Ergänzung, ist aber nicht der aktuelle Standardweg.

3. Die Upload-Endpoints des Moodle-Plugins ermitteln den MIME-Type serverseitig per `finfo_buffer()` aus dem tatsächlichen Dateiinhalt (Muster aus `mod_assign`). Bei allgemeinen Dateien wird der MIME still korrigiert; beim Bild-Einbett-Endpoint wird hart abgewiesen, wenn der erkannte Typ kein `image/*` ist.

## User Stories

1. Als Lehrkraft möchte ich die Setup-URL im Terminal sehen und anklicken können, damit ich die Konfigurationsseite ohne manuelles Zusammenbauen öffne.
2. Als Lehrkraft möchte ich bei versehentlich geschlossenem Browser-Tab die URL erneut aus dem Terminal öffnen können, damit ich den Setup-Server nicht neu starten muss.
3. Als Lehrkraft möchte ich, dass kein anderer Browser-Tab meine Kurspilot-Konfiguration ändern kann, damit mein Setup geschützt ist.
4. Als Lehrkraft möchte ich bei einem manipulierten Download eine klare Fehlermeldung sehen, damit ich nicht unwissentlich schadhaften Code installiere.
5. Als Lehrkraft möchte ich, dass ein fehlgeschlagener Hash-Check die Installation blockiert, damit kein teilweise entpackter, inkonsistenter Zustand entsteht.
6. Als Maintainer möchte ich bei einem neuen Release nur den Tag und den Hash aktualisieren, damit der Release-Aufwand minimal bleibt.
7. Als Maintainer möchte ich, dass ein vergessener Hash-Update laut scheitert statt stillschweigend alten Code zu installieren, damit ich den Fehler sofort bemerke.
8. Als Maintainer möchte ich die Hash-Prüfung in den bestehenden DI-Tests mocken können, damit die Tests ohne echtes Netzwerk laufen.
9. Als Maintainer möchte ich, dass `setup.sh`, `setup.ps1` und `app-provision.js` denselben Tag und denselben Hash verwenden, damit die drei Pfade nicht auseinanderlaufen.
10. Als Sicherheitsprüfer möchte ich, dass das Setup-Token nur für die Lebensdauer des Servers gilt, damit ein geleakter Token nach Server-Stop wertlos ist.
11. Als Lehrkraft möchte ich, dass ein Datei-Upload mit falschem MIME-Type nicht zu einer anders servierten Datei führt, damit mein Kurs keine unerwarteten Content-Types enthält.
12. Als Lehrkraft möchte ich, dass ein Bild-Upload, der kein Bild enthält, klar abgewiesen wird, damit keine HTML-Datei als Inline-Bild in eine Aufgabenbeschreibung eingeschleust wird.
13. Als Maintainer möchte ich, dass die MIME-Prüfung dem mod_assign-Muster folgt, damit der Code konsistent mit Moodle-Core ist und bei zukünftigen Moodle-Updates nicht bricht.

## Implementation Decisions

- **CSRF-Token-Generierung**: `startSetupBrowserServer()` erzeugt beim Start ein Token via `crypto.randomBytes(16).toString('hex')`. Das Token ist über DI (`generateToken`) injizierbar für Tests.

- **Token-Übermittlung**: Das Token wird als Query-Parameter `token` in der URL übergeben. Die Terminal-Ausgabe und der `openBrowser`-Aufruf enthalten die vollständige URL mit Token. Alle Seiten-GETs (`/`) und alle POST-Handler (`/apply-updates`, `/abort`, `/reset-settings`, `/restart-client`, `/restart-service`) prüfen `req.url` auf den Token. `/favicon.ico`, `/check-updates` und das Token-Help-Asset sind ausgenommen (kein Seiteneffekt, keine sensiblen Daten).

- **Token-Ablehnung**: Bei fehlendem oder falschem Token antwortet der Server mit HTTP 403 und einem Klartext-Hinweis ("Ungueltiges oder fehlendes Token. Bitte die URL aus dem Terminal verwenden.").

- **Trusted-main-Download**: `APP_TARBALL_URL`, `setup.sh` und `setup.ps1` verwenden `refs/heads/main.tar.gz`. Jeder Aufruf der Shell-/PowerShell-Installer lädt und entpackt diesen Stand vor dem Start des Konfigurators, auch wenn schon eine alte App-Kopie vorhanden ist.

- **Integritäts-Trade-off**: Für einen beweglichen Branch gibt es keinen festen erwarteten Tarball-Hash. Die Vertrauensgrenze ist daher GitHub über TLS. `provisionApp()` behält den optionalen `expectedHash`-Parameter für Aufrufer, die selbst einen unveränderlichen Artefakt-Hash besitzen.

- **Fehlergrenze**: Bash bricht durch `set -e` bei einem fehlgeschlagenen Entpacken ab. PowerShell prüft nach `tar` ausdrücklich `$LASTEXITCODE` und startet dann nicht still die alte App-Kopie.

- **MIME-Validierung (upload_assignfile.php)**: Nach `base64_decode` wird der tatsächliche MIME per `finfo_buffer($filedata, FILEINFO_MIME_TYPE)` ermittelt und `$fileinfo['mimetype']` damit überschrieben (stille Korrektur, wie mod_assign). Der vom Client gelieferte `mimetype`-Parameter wird ignoriert, sobald der echte Typ feststeht.

- **MIME-Validierung (upload_assign_intro_image.php)**: Dasselbe Verfahren, aber hart: wenn `finfo_buffer()` keinen `image/*`-Typ erkennt, wird eine `invalid_parameter_exception` geworfen ("Hochgeladene Datei ist kein Bild (erkannt: <mime>). Nur Bilddateien koennen eingebettet werden."). Das verhindert, dass eine HTML-Datei als Inline-Bild in die Aufgabenbeschreibung gelangt.

- **Muster-Vorbild**: `mod_assign` nutzt in `locallib.php` denselben `finfo`-Ansatz für Upload-Validierung. Der Code orientiert sich daran, damit er bei Moodle-Core-Updates konsistent bleibt.

## Testing Decisions

- **Nur externes Verhalten testen**: Token-Prüfung wird über HTTP-Requests gegen den echten lokalen Server getestet (wie die bestehenden Tests in `test/setup-browser-server.test.js`). Kein Mocken der HTTP-Layer, kein Testen interner Token-Variablen.

- **Seam 1 – CSRF (test/setup-browser-server.test.js)**:
  - POST ohne Token → 403
  - POST mit falschem Token → 403
  - POST mit gültigem Token → 200 (bestehendes Verhalten)
  - GET `/` ohne Token → 403
  - GET `/` mit Token → 200 (Seite wird gerendert)
  - `openBrowser` erhält URL mit Token-Param
  - Token ist 32 Hex-Zeichen lang
  - Prior Art: bestehende `request()`-Helper und `startSetupBrowserServer()`-Aufrufe in derselben Datei.

- **Seam 2 – Hash (test/app-provision.test.js)**:
  - `provisionApp()` mit korrektem `expectedHash` → entpackt normal
  - `provisionApp()` mit falschem `expectedHash` → Error, kein `extract`-Aufruf
  - `provisionApp()` ohne `expectedHash` (undefined) → verhält sich wie bisher (kein Check, Abwärtskompatibilität)
  - `APP_TARBALL_URL` enthält einen Tag, nicht `main`
  - Prior Art: bestehende DI-Mocks (`fetch`, `extract`, `existsSync`) in derselben Datei.

- **Shell-Scripts**: Kein automatisierter Test (kein Shell-Test-Framework im Projekt). Manuelle Verifikation beim Release. Der Hash-Kommentar und die Variable werden im Code-Review geprüft.

- **Seam 3 – MIME (Plugin-Integrationstest)**:
  - `upload_assignfile` mit PNG-Bytes aber deklariertem `text/html` → gespeicherter MIME ist `image/png` (stille Korrektur)
  - `upload_assign_intro_image` mit HTML-Bytes aber deklariertem `image/png` → Exception, keine Datei gespeichert
  - `upload_assign_intro_image` mit echten PNG-Bytes → Erfolg, MIME korrekt
  - Prior Art: bestehende Integrationstests gegen echte Moodle-Instanz (`test/*.integration.test.js`). `finfo_buffer` ist ein PHP-Builtin ohne Mock-Bedarf.

## Out of Scope

- Komfort-Feature "Terminal versehentlich geschlossen → laufender Server wiederauffindbar" – eigenes Issue.
- GPG-Signatur des Tarballs (Hash reicht für das aktuelle Bedrohungsmodell).
- Automatisches Release-Skript (`make release`) – wird manuell nachgezogen, wenn der Prozess steht.

## Further Notes

- ADR 0008 (curl/PowerShell-Bootstrap) bleibt gültig. Diese Spec ergänzt ADR 0008 um die Integritätsprüfung und ändert die Bezugsquelle von `main` auf einen Tag. Ein eigenes ADR 0010 wird mit der Umsetzung geschrieben.
- Das Setup-Token ist kein Authentifizierungs-Mechanismus im klassischen Sinn – es ist ein CSRF-Mitigation-Token für einen kurzlebigen localhost-Server. Die Bedrohung ist ein bösartiger Browser-Tab, nicht ein Netzwerkangreifer.
- Der Hash-Check schützt gegen: verschobenen Tag (Repo-Kompromittierung), korrupten Download, MITM trotz HTTPS (theoretisch). Er schützt nicht gegen: einen Angreifer, der sowohl den Tag als auch den Hash in der Spec gleichzeitig ändert (dann wäre das Repo bereits vollständig kompromittiert).
