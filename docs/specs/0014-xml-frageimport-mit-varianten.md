# Spezifikation: XML-Frageimport mit Varianten

## Problem Statement

Komplexe Fragetypen wie STACK (symbolisches Computer-Algebra-System) lassen sich nicht über `create_mc_question` oder vorhandene Formularfelder abbilden. Alle STACK-spezifischen Strukturen — Variablen, Eingabefelder, Potentielle-Antworten-Bäume (PRTs), Deployment-Seeds, Fragentests — sind in Moodle-XML enthalten und können nur über den XML-Importpfad geschrieben werden. Moodle 5.0 bietet dafür keinen öffentlichen Webservice; der Import ist ausschließlich über die UI zugänglich.

Beim wiederholten Import einer korrigierten Fassung erzeugt Moodles Standard-Importpfad (`importprocess`) immer einen neuen `question_bank_entries`-Datensatz — bestehende Quiz-Slot-Referenzen und Versionsgeschichte gehen verloren. Für einen redaktionellen Workflow (Frage korrigieren, neu importieren, Quiz folgt automatisch) ist das unbrauchbar.

## Solution

Ein neuer Webservice `local_coursepilot_import_questions_xml` und das MCP-Tool `moodle_import_questions_xml` nehmen XML-Frageinhalt entgegen, parsen ihn über die öffentliche `qformat_xml`-API und schreiben über `question_type::save_question()` — nicht über `importprocess()`. Dadurch entsteht beim Reimport eine neue Version derselben `questionbankentryid` (ADR-0001-Pfad), und Quiz-Slots, die auf „immer aktuellste Version" stehen, folgen automatisch.

Wiedererkennung läuft über `idnumber`. Um jeden Reimport eindeutig zu machen, vergibt künftig auch `create_mc_question` beim Erstanlegen eine generierte `idnumber`. Bei uneindeutigen Fällen schreibt der Adapter nichts und fordert Bestätigung.

ADR 0001 erhält einen kurzen Nachtrag zu diesem Reimport-Verhalten.

## User Stories

1. As a teacher, I want to import a STACK question from an XML file, so that I can add computer-algebra questions without recreating all inputs and PRTs manually.
2. As a teacher, I want to import any Moodle-XML-compatible question type, so that questions from other Moodle instances or exports can be transferred without a browser form.
3. As a teacher, I want a reimport of a corrected question to create a new version of the same question bank entry, so that quiz slots automatically reference the corrected version without reconfiguration.
4. As a teacher, I want the import to stop and report a problem if the question cannot be unambiguously matched, so that I never accidentally create a duplicate or overwrite the wrong entry.
5. As a teacher, I want to confirm an ambiguous match explicitly, so that I remain in control of every write to the question bank.
6. As a teacher, I want the result to show the old and new question text side by side on a match, so that I can verify the change is what I intended.
7. As a teacher, I want each question result to include name, question bank entry id, and new version number, so that I can trace what was written.
8. As a teacher, I want `get_question` to return the idnumber, so that I can use it for subsequent reimports without looking it up in Moodle.
9. As a teacher, I want `create_mc_question` to assign an idnumber automatically, so that MC questions are reimport-ready from the start.
10. As a teacher, I want parse errors in the XML to abort the whole call, so that partially broken files never result in partial imports.

## Implementation Decisions

### Adapter und Parsing

- Neuer Plugin-Webservice `local_coursepilot_import_questions_xml` / MCP-Tool `moodle_import_questions_xml`.
- **Kein Core-Webservice vorhanden** (Moodle 5.0, `lib/db/services.php` enthält keine Import-Funktion; `question/bank/importquestions/` hat kein `db/services.php`). Die Lücke ist real; Regel „Core zuerst" ist geprüft.
- Parse: `qformat_xml::readquestions()` — reines Parsen ohne DB-Zugriff. XML-Parse-Fehler (ungültige Struktur, unbekannter Fragetyp ohne `import_from_xml()`-Methode) brechen den gesamten Aufruf ab; kein Teilergebnis wird in die DB geschrieben.
- Kontext-Auflösung: `categoryid` → Kategoriekontext analog zum bestehenden Muster in `update_question_category.php::resolve_question_bank_context()`.
- Capability: `moodle/question:add` im Kategorie-Kontext (wie UI-Import).
- Parameter: `categoryid` (Zielkategorie, Pflicht), `xmlcontent` (Moodle-XML als `PARAM_RAW`) und `allownew` (bool, Default false — bestätigt ausschließlich die gemeldeten Verdachtsfälle eines erneuten Aufrufs).
- Dateien (base64-`<file>`-Blöcke im XML) werden unverändert über den qformat-Import-Pfad verarbeitet; für kleine PNG-Symbole geeignet.

### Schreiben: `save_question()` statt `importprocess()`

- **Neue Version, kein Neueintrag:** `question_type::save_question($question, $form)` mit gesetztem `$question->id` (questionid der letzten Version des bestehenden Eintrags) erzeugt eine neue `question`-Zeile und eine neue `question_versions`-Zeile unter der bestehenden `questionbankentryid`. Identisch mit dem Verhalten von `update_mc_question`; ADR-0001-konform.
- **Neuer Eintrag bei echtem Erstimport:** Nur wenn das XML weder eine `idnumber` noch einen gleichnamigen Eintrag in der Zielkategorie enthält, ruft der Adapter `save_question()` ohne `$question->id` auf.
- **Neuer Eintrag nach Bestätigung:** Ein zuvor gemeldeter Verdachtsfall wird erst im erneuten Aufruf mit `allownew = true` ohne `$question->id` angelegt. Er bleibt damit ein bewusst bestätigter Verdachtsfall, nicht ein echter Erstimport.
- `importprocess()` wird **nicht** verwendet — er erzeugt immer neue `question_bank_entries`-Datensätze und kann nicht auf Versionstreue umkonfiguriert werden.

### Wiedererkennung

- **idnumber maßgeblich** (Matching nur innerhalb der Zielkategorie).
- **Fallback auf exakten Namen**, ausschließlich wenn das XML keine `idnumber` trägt.
- **Verdachtsfall — XML hat idnumber, kein Kategorie-Eintrag hat sie:** Es wird nichts geschrieben. Das Ergebnis enthält: mitgebrachte idnumber, Zielkategorie, nahe Kandidaten (gleichnamige Einträge). Neueintrag entsteht erst nach erneutem Aufruf mit `allownew = true`.
- **Namens-Fallback ohne idnumber, gleichnamiger Eintrag:** Ebenfalls Bestätigungspflicht (`allownew = true`), weil Namensgleichheit keine Identitätssicherheit bietet und Quiz-Slots bei falscher Zuordnung einer neuen Version automatisch folgen würden.
- **Echter Erstimport** (keine idnumber, kein Namenstreffer): Neueintrag ohne Bestätigung.

### idnumber-Vergabe

- `create_mc_question` vergibt beim Erstanlegen eine generierte `idnumber` (z. B. UUID oder kurzer Hash), sodass jede über MCP erstellte Frage reimport-bereit ist.
- `moodle_import_questions_xml` vergibt beim Erstimport einer Frage ohne `<idnumber>` ebenfalls eine generierte `idnumber`.
- `get_question` gibt `idnumber` im Rückgabeobjekt zurück.

### Ergebnis-Meldung pro Frage

Jeder Eintrag im Ergebnis-Array enthält: `name`, `questionbankentryid`, `version` (neu), `status` (`created` | `versioned` | `skipped_ambiguous`). Bei `versioned` und bei jedem Verdachtsfall enthält er zusätzlich `questiontext_old` (letzte Version bzw. Kandidat, soweit vorhanden) und `questiontext_new`, damit die Lehrkraft Identität und Änderungsumfang prüfen kann. Ein Verdachtsfall ohne idnumber-Treffer nennt zusätzlich die mitgebrachte `idnumber`, Zielkategorie und nahe Kandidaten.

### ADR 0001 Nachtrag

ADR 0001 erhält einen kurzen Anhang: XML-Reimport nutzt `save_question()` mit idnumber-Matching; Verdachtsfälle nur mit expliziter Lehrkraftbestätigung. Kein inhaltlicher Widerspruch zum bestehenden Beschluss — gleiche Versionierungslogik, ergänzter Importpfad.

### STACK

- STACK implementiert `import_from_xml()` vollständig (Inputs, PRTs inkl. Nodes, Deployment-Seeds, Fragentests, Dateien).
- Vor Produktivnutzung: Roundtrip-Pilot auf der Testinstanz (STACK-Frage exportieren → XML-Import über den neuen Adapter → Diff der Optionen/PRTs).
- `get_question` deckt STACK-Felder heute nicht ab; das ist kein Blocker für diese Spec — der Importpfad ist unabhängig vom Read-back.

## Testing Decisions

- **MC-Erstimport:** XML mit einer bekannten MC-Frage in leere Kategorie importieren → Eintrag mit generierter idnumber, version=1.
- **MC-Reimport:** Fragetext leicht ändern, XML neu importieren → `questionbankentryid` gleich, version=2; Quiz-Slot-Read-back zeigt neue questionid.
- **Verdachtsfall:** XML mit idnumber, die in Kategorie nicht vorkommt → Ergebnis `skipped_ambiguous`, keine DB-Schreiboperation. Der erneute, ausdrücklich bestätigte Aufruf mit `allownew = true` → Neuer Eintrag; das Ergebnis bleibt als bestätigter Verdachtsfall nachvollziehbar.
- **Parse-Fehler:** Ungültiges XML → Aufruf bricht ab, kein Teileintrag.
- **idnumber in `create_mc_question`:** Neues Ticket nach Erstanlegen enthält idnumber im Read-back.
- **`get_question` idnumber:** Read-back einer bestehenden Frage enthält das `idnumber`-Feld.
- Bestehende MC-Fragen-, Fragenbank- und Quiz-Integrationstests bleiben grün.

## Out of Scope

- STACK-Read-back über `get_question` (erfordert gesonderte STACK-Feld-Abbildung).
- Import anderer Formate als Moodle-XML (Gift, Aiken, Blackboard usw.).
- Löschen oder Mergen von Fragenbank-Einträgen über den Importpfad.
- Vollständige Formularsteuerung komplexer Fragetypen über MCP-Felder — der XML-Importweg ist bewusster Ausfallweg statt Ersatz.
- Implementierung, Deployment, Migration bestehender Kurse.

## Further Notes

- Wayfinder-Karte und Entscheidungshistorie: [Issue #280](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/280).
- Forschungsgrundlage: `docs/research/2026-08-14-fragen-xml-import.md` (Branch `research/fragen-xml-import`, Issue #282).
- Grilling-Entscheidungen: [Issue #285](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/285).
- ADR 0001: `docs/adr/0001-use-native-moodle-question-versioning.md` — dieser Spec-Nachtrag ergänzt den bestehenden Beschluss um den XML-Reimport-Pfad.
- STACK-Plugin: `maths/moodle-qtype_stack`, `questiontype.php` (export_to_xml:1574, import_from_xml:1771). Roundtrip-Pilot vor Rollout empfohlen.
- `save_question()`-Aufruf erwartet `$form`-Felder (`questiontext['itemid']`, `category` als „id,contextid"-String, `status` u. a.); die Abbildung der qformat_xml-Parse-Ergebnisse auf diese Struktur ist der eigentliche Implementierungsaufwand und qtype-spezifisch zu testen.
