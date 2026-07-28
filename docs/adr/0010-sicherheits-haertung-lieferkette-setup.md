# Sicherheits-Härtung von Lieferkette und Setup-Server

> Ergänzt [ADR 0008](0008-curl-bootstrap-vertrieb.md). Umsetzung zu
> [Issue #193](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/193)
> gemäß [Spezifikation 0004](../specs/0004-lieferketten-haertung-setup-csrf.md).

## Problem

Der Bootstrap aus ADR 0008 bezog den App-Tarball vom beweglichen `main`-Branch
und prüfte ihn nicht vor dem Entpacken. Der lokale Setup-Server konnte zudem
keine schreibenden Requests gegen fremde Browser-Tabs abgrenzen. Beim
Plugin-Upload war der vom Client gemeldete MIME-Type nicht zwingend der
tatsächliche Dateiinhalt.

## Optionen

- **Bestehenden Bootstrap unverändert lassen:** kein zusätzlicher
  Release-Aufwand, aber ein verschobener Branch oder manipulierter Download
  würde ausgeführt; der Setup-Server und Uploads blieben ungehärtet.
- **Nur Tag-Pin oder nur Hash-Prüfung:** ein Tag macht die Bezugsquelle stabil,
  der SHA256-Vergleich erkennt aber erst die Manipulation des Downloads oder
  eines verschobenen Tags. Jede Maßnahme allein lässt eine Lücke.
- **Tag-Pin, SHA256-Vorabverifikation, CSRF-Token und serverseitige
  MIME-Ermittlung:** sichert die drei betroffenen Vertrauensgrenzen mit den
  vorhandenen Plattformmitteln ab.

## Entscheidung

Kurspilot bezieht den App-Tarball über einen **Release-Tag statt `main`** und
prüft dessen **SHA256-Hash vor dem Entpacken**. Ein Hash-Mismatch bricht die
Installation ab, bevor Dateien oder Idempotenz-Marker geschrieben werden.

Der Setup-Server erzeugt pro Lauf ein einmaliges CSRF-Token. Es steht in der
lokalen Setup-URL und ist für Seiten-GETs sowie schreibende Requests
erforderlich; ohne gültiges Token antwortet der Server mit 403.

Die Moodle-Upload-Endpoints bestimmen den MIME-Type per `finfo` aus den
tatsächlichen Bytes. Allgemeine Uploads übernehmen den erkannten Typ; der
Bild-Endpoint weist Nicht-Bilder hart zurück.

## Konsequenzen

- **Positiv:** Der Bootstrap führt keinen ungeprüften `main`-Stand aus,
  manipulierte oder beschädigte Tarballs stoppen vor der Installation,
  fremde Browser-Tabs können den Setup-Server nicht auslösen und Uploads
  werden mit ihrem tatsächlichen MIME-Type behandelt.
- **Negativ:** Jeder Release muss Tag und erwarteten SHA256-Hash konsistent in
  den drei Bootstrap-Pfaden aktualisieren. Die Setup-URL enthält für die
  Serverlaufzeit ein Token und darf nicht weitergegeben werden; ein
  versehentliches Schließen des Tabs erfordert weiterhin die URL aus dem
  Terminal.
