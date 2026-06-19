# Wellenplan: PRD 0001 – Quiz/Fragenbank, Plan-Generator, lokaler Kontext, Material-Pipeline

Vertical-Slice-Issues aus `docs/prd/0001-igs-moodlemcp-v1-fortbildungsfaehige-arbeitsversion.md`, gruppiert in Wellen nach Abhaengigkeitstiefe. Innerhalb einer Welle koennen Issues parallel von verschiedenen Agenten bearbeitet werden. Fuer Overseer-Handoffs: diese Datei verlinken, Status pro Issue im Issue-Tracker pflegen (Labels `ready-for-agent`/`ready-for-human`, dann Issue schliessen).

Repo: `matthiasgruenwald/Kurspilot`

## Welle 1

Keine offenen Abhaengigkeiten — kann sofort starten.

| # | Titel | Typ |
|---|---|---|
| [#1](https://github.com/matthiasgruenwald/Kurspilot/issues/1) | Test-Infrastruktur: Moodle-Testinstanz + `.env.example` | HITL |
| [#2](https://github.com/matthiasgruenwald/Kurspilot/issues/2) | Implementierungsplan-Generator + gestufte Vorschau | AFK |
| [#3](https://github.com/matthiasgruenwald/Kurspilot/issues/3) | Lokaler Kontext: `local-context/`-Struktur, Setup | AFK |
| [#4](https://github.com/matthiasgruenwald/Kurspilot/issues/4) | Terminologie-Rewrite (IGS-Begriffe, Urheberrecht, Startformulierungen) | AFK |
| [#5](https://github.com/matthiasgruenwald/Kurspilot/issues/5) | Kollegiums-Installer (Windows-first) + Token-Setup | HITL |

## Welle 2

Voraussetzung: Welle 1 abgeschlossen (#1, #2, #3).

| # | Titel | Typ | Blocked by |
|---|---|---|---|
| [#6](https://github.com/matthiasgruenwald/Kurspilot/issues/6) | Quiz-Erstellung mit Lerncheck-Modus-Defaults | AFK | #1 |
| [#7](https://github.com/matthiasgruenwald/Kurspilot/issues/7) | Fragenbank-Kategorien je Unterthema/Abschnitt | AFK | #1 |
| [#8](https://github.com/matthiasgruenwald/Kurspilot/issues/8) | Journal-System: Umsetzungsbericht, Fortsetzen-Routine | AFK | #2, #3 |

## Welle 3

Voraussetzung: Welle 2 abgeschlossen.

| # | Titel | Typ | Blocked by |
|---|---|---|---|
| [#9](https://github.com/matthiasgruenwald/Kurspilot/issues/9) | MC-Fragen erstellen/bearbeiten mit nativer Versionierung | AFK | #1, #7 |
| [#10](https://github.com/matthiasgruenwald/Kurspilot/issues/10) | Quiz-Bestehensabschluss + Sperre fuer Folgeaktivitaet | AFK | #6 |
| [#11](https://github.com/matthiasgruenwald/Kurspilot/issues/11) | Test-Modi: Intensiv-Ueben & Bewertungsmodus | AFK | #6 |
| [#12](https://github.com/matthiasgruenwald/Kurspilot/issues/12) | Material-Ingestion: Speichern + sprechende Dateinamen | AFK | #3, #8 |

## Welle 4

Voraussetzung: Welle 3 abgeschlossen.

| # | Titel | Typ | Blocked by |
|---|---|---|---|
| [#13](https://github.com/matthiasgruenwald/Kurspilot/issues/13) | Fragen-Referenzen in Quiz einhaengen (latest version) | AFK | #6, #9 |
| [#14](https://github.com/matthiasgruenwald/Kurspilot/issues/14) | Lesbare Fragenvorschau (Datenformat) | AFK | #9 |
| [#15](https://github.com/matthiasgruenwald/Kurspilot/issues/15) | OCR-Extraktion via Agent-Vision + Kontroll-Gate | AFK | #12 |
| [#16](https://github.com/matthiasgruenwald/Kurspilot/issues/16) | Alt-Text-Generierung fuer Fachabbildungen via Vision | AFK | #12 |
| [#17](https://github.com/matthiasgruenwald/Kurspilot/issues/17) | Bildausschnitt-Zuschnitt (Crop-Tooling-Entscheidung) | HITL | #12 |

## Welle 5

Voraussetzung: Welle 4 abgeschlossen.

| # | Titel | Typ | Blocked by |
|---|---|---|---|
| [#18](https://github.com/matthiasgruenwald/Kurspilot/issues/18) | Fragen-Edit-Vorschau: Inline-Diff/Side-by-Side + Eskalation | AFK | #9, #14 |
| [#19](https://github.com/matthiasgruenwald/Kurspilot/issues/19) | Material zu Moodle-Textseite mit Quellenhinweis/Lehrwerkverweis | AFK | #15 |

## Welle 6

Voraussetzung: Welle 5 abgeschlossen.

| # | Titel | Typ | Blocked by |
|---|---|---|---|
| [#20](https://github.com/matthiasgruenwald/Kurspilot/issues/20) | Plan-Generator um Quiz/Fragen + Materialluecken erweitern | AFK | #2, #10, #11, #13, #14, #18 |

## Hinweise

- Alle AFK-Issues: Umsetzung folgt `/karpathy-guidelines`, testgetrieben via `/tdd`.
- HITL-Issues (#1, #5, #17) brauchen menschliche Entscheidung/Verifikation, bevor nachgelagerte AFK-Issues sinnvoll integrationstestbar sind (insb. #1 fuer alle Plugin-Webservice-Slices in Welle 2+).
- #17 (Crop-Tooling-Entscheidung inkl. ADR) kann parallel zu Welle 1-3 vorab entschieden werden, falls Kapazitaet da ist — blockiert sonst nur #19 ueber #16/#15-Kette nicht direkt, aber das Endprodukt (Material mit Fachabbildungen) erst in Welle 5/6.
