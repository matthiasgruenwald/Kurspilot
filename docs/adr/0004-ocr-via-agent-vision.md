# OCR via Agent-Vision statt OCR-Bibliothek

Fuer **OCR-Extraktion** (CONTEXT.md) aus Screenshots und Scans nutzt MoodleMcp
das Vision-Lesevermoegen des Agenten: Claude liest die Bilddatei direkt ueber
das Read-Tool und liefert einen bearbeitbaren Text-Entwurf. Es wird keine
OCR-Bibliothek als neue Laufzeit-Dependency eingefuehrt, denn `moodle-mcp.js`
hat laut CLAUDE.md bewusst keine Laufzeit-Dependencies und der Agent kann die
Aufgabe ohnehin erledigen.

Der Workflow ist zweistufig und enthaelt ein Kontroll-Gate: Nach dem Speichern
eines Materials (#12) erzeugt der Agent per Vision-Read einen OCR-Entwurf
(`lib/ocr-review.js`, Status `pending_review`). Die Lehrkraft prueft und
korrigiert den Text (**OCR-Kontrolle**) und gibt ihn explizit frei
(`approveOcrDraft`, Status `approved`). Erst danach darf `moodle_create_page`
mit dem freigegebenen Text aufgerufen werden; `assertApprovedForMoodle` wirft
einen Fehler, falls dies ohne Freigabe versucht wird. Das **Originalmaterial**
(Scan/Screenshot) bleibt unveraendert unter `materials/<thema>/original/`
erhalten und wird nicht geloescht oder zusaetzlich als Standardinhalt in
Moodle angezeigt.

## Considered Options

- OCR-Bibliothek (z.B. Tesseract-Binding) als neue Dependency: rejected, weil
  es gegen die "keine Laufzeit-Dependencies"-Vorgabe verstoesst, eine
  zusaetzliche Systemabhaengigkeit (Tesseract-Binary) erfordert und der Agent
  Bilder bereits zuverlaessig per Vision lesen kann.
- Direkter `moodle_create_page`-Aufruf mit unkontrolliertem OCR-Text:
  rejected, weil CONTEXT.md **OCR-Kontrolle** als Pflicht vor jedem
  Moodle-Schreibzugriff definiert (_Avoid_: "OCR-Fehler ungeprueft nach
  Moodle schreiben, komische Begriffe als Materialgrundlage").
- Agent-Vision-Read + Kontroll-Gate-Datenmodell (`lib/ocr-review.js`):
  accepted, weil es ohne neue Dependency funktioniert, die
  **OCR-Kontrolle** strukturell erzwingt und das **Originalmaterial**
  unangetastet laesst (CONTEXT.md "Originalmaterial",
  _Avoid_: "Original nach OCR loeschen").
