# Referenz: Arbeitsblätter für Moodle-Aufgaben (mod_assign)

Lies diese Datei, wenn zu einer Phase ein ausfüllbares Word-Arbeitsblatt
(.docx) erstellt und in eine Aufgabe hochgeladen werden soll.

## Kein Bewertungsraster
Arbeitsblätter dürfen **kein Bewertungsraster und keine Punktetabelle** enthalten. Moodle hat eine eigene Bewertungsfunktion — ein Raster im Dokument wäre eine überflüssige Dopplung.

## Keine Metadaten-Felder
Arbeitsblätter dürfen **keine Felder für Name, Klasse oder Datum** enthalten. Moodle protokolliert diese Informationen automatisch bei der Abgabe.

## Thematisches Design
Das Design richtet sich nach dem **Fachthema der Unterrichtseinheit**, nicht nach einem generischen Schul-Layout.
- Header: dunkler Hintergrund, fachspezifische Akzentfarbe, thematisches Icon
- Jede Phase bekommt eine eigene Akzentfarbe passend zur Phase
- Beispiel IoT/ESP32: Cyan `#06B6D4`, Dark Slate `#0F172A`, Monospace für Code, Icons wie `>>--[GPIO]-->>` oder `f=1/T`

## Pflicht-Struktur
1. **Thematischer Header** — einspaltig, dunkler Hintergrund, Akzentfarbe, Phasenname + Themen-Icon
2. **Einleitungssatz** — kurze Aufgabenbeschreibung
3. **Nummerierte Fragen** mit Badge-Nummern
4. **Ausfüllbare Antwortfelder** — graue Tabellenzellen (`#F8FAFC`) mit gestrichelter Unterlinie
5. **Fußzeile** — Abgabehinweis (kursiv, grau)

## Upload
Nach Erstellung per `mcp__moodle__moodle_upload_assignfile` hochladen:
- `cmid`: Course Module ID der Aufgabe
- `filepath`: absoluter Pfad zur lokalen .docx-Datei
- `filename`: Dateiname in Moodle

> **Hinweis:** Das Tool meldet `dmlwriteexception` — das ist ein bekannter Pseudo-Fehler. Die Datei wird trotzdem erfolgreich hochgeladen.
