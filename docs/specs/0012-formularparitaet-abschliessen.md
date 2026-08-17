# Spezifikation: Formularparität abschließen

## Problem Statement

Fünf Lücken aus der Formularparitäts-Arbeit von Spec 0009 sind offen oder erneut aufgetreten:

**KP-006 – Bild-Upload in Fragen:** `create_mc_question` und `update_mc_question` nehmen keine Bilddateien entgegen. Lehrkräfte, die Bilder in Fragetext oder Antwortfeedback einbetten wollen, müssen in die Moodle-Fragenbank wechseln. Das zweiphasige Base64-Upload-Muster (etabliert für Aufgaben-Intro-Bild, Dateiabgaben und Ordner-Dateien) existiert dreifach im Plugin — ein vierter Anwendungsfall rechtfertigt die Extraktion eines gemeinsamen Hilfsbausteins.

**KP-007 – Antwortnummerierung:** `create_mc_question` setzt `answernumbering` nicht explizit. Moodle wählt dann den Instanzdefault (meist `abc`), obwohl Antworten gemischt werden und eine festgelegte Reihenfolge irreführend ist. Der Wert ist zwar lesbar, wird aber nicht zurückgegeben.

**KP-009 – Quiz-Teilupdates:** `update_quiz_settings` sendet immer `mode` und alle Override-Felder mit ihren Sentinel-Werten an das Plugin. Der Plugin-Webservice wendet dabei den Modus-Default an, sobald `mode` übergeben wird — auch wenn die Lehrkraft nur einen einzigen Wert ändern wollte. Das führt zu unerwarteten Resets fremder Einstellungen (z. B. `preferredbehaviour`, `attempts`) beim einfachen Ändern der `gradepass`-Grenze.

**KP-008 – Aufgabenbeschreibung:** `moodle_update_assign` meldet Erfolg und übernimmt Titel sowie Einstellungen, speichert aber die übergebene HTML-Beschreibung nicht zuverlässig. Der anschließende Read-back kann weiterhin den alten Text enthalten. Das ist eine Regression gegenüber Spec 0009 und darf nicht als Erfolg behandelt werden.

**KP-012 – Quiz-Aktivitätstitel:** Ein bestehendes Quiz lässt sich nicht gezielt umbenennen. Nach einer fachlichen Umnummerierung bleibt sein sichtbarer Titel im Kurs veraltet, obwohl Fragenbank-Kategorie, Aufgaben und Textseiten aktualisiert werden konnten.

## Solution

`update_mc_question` kopiert beim Anlegen der neuen Version automatisch alle Dateien der Vorgängerversion auf die neuen Frage- und Antwort-Ids (Copy-on-version). Ein neues Tool `moodle_upload_question_image` ermöglicht den Base64-Upload in `questiontext` und `answerfeedback`. Der gemeinsame Upload-Kern wird in einen PHP-Helper extrahiert; `get_question` liefert strukturierte Datei-Metadaten je Bereich.

`answernumbering` wird im Plugin fest auf `none` gesetzt. `get_question` gibt den Wert zurück. Kein neuer MCP-Parameter ist nötig.

`update_quiz_settings` wird zu einem reinen Patch: Der Plugin-Webservice lädt den Ist-Zustand, wendet nur explizit übergebene Felder an und schreibt das Ergebnis zurück. `mode` wird nur verarbeitet, wenn ausdrücklich übergeben. Das Verhalten entspricht dem `update_assign`-Muster aus Spec 0009.

Der Patch umfasst auch ein optionales Feld `name`, um eine bestehende Quiz-Aktivität ohne Nebenwirkungen umzubenennen. `moodle_update_assign` muss die übergebene Beschreibung zuverlässig speichern und den Erfolg anschließend durch Read-back belegen; der konkrete Reparaturpunkt wird aus der Regressionsermittlung zu KP-008 abgeleitet.

## User Stories

1. As a teacher, I want to embed an image in a question text, so that visual tasks can be created without switching to the Moodle question bank.
2. As a teacher, I want to embed an image in the answer feedback of a question, so that explanatory visuals appear when a student reviews their result.
3. As a teacher, I want images to survive a question update automatically, so that I do not need to re-upload every image when I correct a typo.
4. As a teacher, I want to replace an image by uploading a file with the same name, so that updating a graphic is a single step without a delete-first call.
5. As a teacher, I want the image upload to validate the file type and size, so that unsupported formats are rejected with a clear message before they reach Moodle.
6. As a teacher, I want `get_question` to list the files embedded in each text area, so that I can confirm what images are attached without loading the Moodle UI.
7. As a teacher, I want answer options to appear without letters or numbers, so that shuffled answers do not suggest a false ordering to students.
8. As a teacher, I want `get_question` to show the effective numbering setting, so that I can verify the value without opening the Moodle form.
9. As a teacher, I want changing a single quiz setting to leave all other settings untouched, so that adjusting the passing grade does not accidentally reset the question behaviour.
10. As a teacher, I want to call `update_quiz_settings` without a mode and have the current mode preserved, so that I can make targeted corrections without knowing the original creation mode.
11. As a teacher, I want `update_quiz_settings` to return the full effective settings after the update, so that I can verify the result without a separate read call.
12. As a teacher, I want changing an assignment description to persist the new HTML and be verified by read-back, so that a success response never hides stale learner-visible content.
13. As a teacher, I want to rename an existing quiz without changing its questions or settings, so that course renumbering stays consistent without using the Moodle UI.

## Implementation Decisions

### KP-006: Bild-Upload in Fragen

- Neues Tool **`moodle_upload_question_image`** folgt dem zweiphasigen Muster: erst Frage anlegen/aktualisieren (→ `questionid`, `answerids` im Rückgabewert), dann Bild hochladen, dann HTML-Feld mit dem zurückgegebenen `@@PLUGINFILE@@`-Snippet setzen.
- Unterstützte Bereiche: `questiontext` und `answerfeedback`. `answer`, `generalfeedback` und kombiniertes Feedback (`correctfeedback`, `partiallycorrectfeedback`, `incorrectfeedback`) sind dokumentierter Erweiterungspfad — die Filearea-Mechanik gilt analog — aber nicht Gegenstand dieser Spec.
- Schnittstelle: `questionid` (question.id der Zielversion), `area` (`questiontext`|`answerfeedback`), `answerid` (Pflicht wenn `area = answerfeedback`), `filename` (PARAM_FILE), `content` (Base64, PARAM_RAW), optional `alt` (Alternativtext, Default leer). Rückgabe: `fileid`, `filename`, HTML-Snippet mit `@@PLUGINFILE@@`.
- Validierung: `base64_decode(..., true)` mit Exception bei Fehler; `finfo_buffer()`-MIME-Check; nur `image/*` zugelassen; Größenlimit 5 MB. Übereinstimmend mit dem Vorbild `upload_assign_intro_image`.
- Idempotenz: gleichnamige Datei in derselben Area/Itemid wird vor dem Schreiben gelöscht (Delete-vor-Write). Keine Exception bei Namensgleichheit.
- Kontext: Dateien liegen unter `component = 'question'` im Kontext der Fragenbank-Kategorie (`question_categories.contextid`). Itemid ist für `questiontext` die `question.id`, für `answerfeedback` die `question_answers.id` der Zielversion.
- Capabilities: `local/coursepilot:use` + `moodle/question:add` für neue Versionen; `moodle/question:editmine` bzw. `editall` (analog `question_has_capability_on`) für Uploads in Bestandsversionen.
- **Copy-on-version** in `update_mc_question`: Beim Anlegen der neuen Frageversion werden alle Dateien der Vorgängerversion per `file_storage::create_file_from_storedfile` auf die neuen Ids kopiert — `questiontext`/`generalfeedback` mit der neuen `question.id`, `answer`/`answerfeedback` mit den neuen `question_answers.id`-Werten (Mapping per Position/Index). Dateien überleben Updates ohne erneuten Upload.
- **Gemeinsamer Upload-Helper:** Der in drei Plugin-Klassen kopierte Kern (Base64-Decodierung, MIME-Prüfung, Delete-vor-Write, `create_file_from_string`) wird bei dieser vierten Implementierung in einen shared Helper extrahiert (`classes/fileupload_helper.php` o. ä.). Bestehende Upload-Webservices werden auf den Helper umgestellt.
- **Read-back in `get_question`:** Strukturierte Dateiliste je Bereich (`filearea`, `itemid`, `filename`, `filesize`, `mimetype`) — keine `pluginfile.php`- oder Preview-URLs. Die Roh-HTML-Felder zeigen `@@PLUGINFILE@@`-Snippets bereits; URL-Generierung bleibt der Moodle-UI überlassen. Bereiche werden aufgelistet soweit Dateien vorhanden; leere Bereiche werden weggelassen.

### KP-007: Antwortnummerierung

- `create_mc_question` und `update_mc_question` setzen `answernumbering = 'none'` im Plugin-Webservice fest. Kein neuer MCP-Parameter; die Lehrkraft sieht den Wert im Read-back.
- `get_question` gibt `answernumbering` im Rückgabeobjekt zurück.
- Begründung: Moodle mischt Antworten; eine aufgedruckte Nummerierung ist didaktisch irreführend, weil sich die Reihenfolge in jedem Versuch ändert. Keine Situation im Kurspilot-Kontext erfordert eine Nummerierung.

### KP-009: Quiz als reines Patch

- Der Plugin-Webservice `local_coursepilot_update_quiz_settings` lädt den aktuellen Quiz-Ist-Zustand als Snapshot, überschreibt nur explizit übergebene Felder und ruft dann Moodles Quiz-Update-API auf. Nicht übergebene Felder bleiben unverändert.
- `mode` wird nur angewendet, wenn der Aufrufer ihn explizit übergibt. Wird `mode` übergeben, gelten für alle Felder ohne expliziten Wert die Sentinel-Defaults des jeweiligen Modus (bestehende Override-Logik bleibt für diesen Fall erhalten).
- MCP-seitig: `moodle_update_quiz_settings` sendet `mode` nur, wenn er in `args` vorhanden ist (`args.mode !== undefined`). Der bestehende Sentinel-Default `"lernstandscheck"` wird nicht mehr automatisch gesendet.
- Der Rückgabewert enthält die effektiven Einstellungen nach dem Update (konsistent mit `update_assign`-Verhalten aus Spec 0009).
- Bestehende `create_quiz`-Aufrufe sind nicht betroffen; dort ist `mode` weiterhin ein expliziter Parameter mit Default `lernstandscheck`.

### KP-012: Bestehendes Quiz umbenennen

- `moodle_update_quiz_settings` erhält das optionale Feld `name` (nicht leer, `PARAM_TEXT`). Es wird nur übertragen, wenn es ausdrücklich übergeben wurde.
- Ein Aufruf mit ausschließlich `cmid` und `name` ändert nur den sichtbaren Aktivitätstitel. Fragen und ihre Reihenfolge, Slots, Bewertung, Abschluss, Sichtbarkeit sowie alle übrigen Quiz-Einstellungen bleiben unverändert.
- Der Rückgabewert enthält den effektiven Namen und die unveränderten, bereits für den Patch zurückgelieferten Quiz-Einstellungen.

### KP-008: Aufgabenbeschreibung zuverlässig aktualisieren

- **Ursache** (belegt in [Task #318](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/318)): `assign_settings::snapshot()` ruft `get_moduleinfo_data()` auf, das neben `intro` einen `introeditor`-Draft mit dem bisherigen Text liefert. `assign_settings::patch()` ersetzt bei einem `description`-Patch nur `moduleinfo->intro` und `introformat`; `update_moduleinfo()` verarbeitet anschließend weiterhin den alten `introeditor`-Draft und überschreibt damit die neue Beschreibung.
- **Reparatur:** Bei einem nichtleeren `description`-Patch setzt `assign_settings::patch()` zusätzlich `moduleinfo->introeditor['text']` und `introeditor['format']` auf die neue HTML-Beschreibung; `itemid` und übrige Optionen des Editor-Drafts bleiben aus dem Snapshot erhalten. Andere Felder oder Subplugin-Snapshots werden nicht verändert.
- Nach `update_moduleinfo()` lädt der Webservice `assign.intro` erneut. Weicht der gespeicherte Text vom angeforderten Inhalt ab, liefert er einen Fehler statt `Assignment updated successfully.`.
- Titel und andere explizit übergebene Aufgabenfelder bleiben gemeinsam aktualisierbar; sie dürfen weder die Beschreibung überdecken noch durch deren Prüfung zurückgesetzt werden.

## Testing Decisions

- Tests prüfen externes Verhalten, nicht interne Datenbankfelder direkt.
- **KP-006 Upload:** Integrationstest: Frage anlegen → Bild hochladen → `get_question` zeigt Datei-Metadaten; Antwort-Feedback analog. Negativ: falscher MIME-Typ und Überschreitung des Größenlimits liefern klar strukturierte Fehler. Idempotenz: zweimaliger Upload desselben Dateinamens erzeugt keine Exception.
- **KP-006 Copy-on-version:** `update_mc_question` → `get_question` zeigt dieselbe Datei unter der neuen Version; kein erneuter Upload nötig.
- **KP-007 Numbering:** `create_mc_question` → `get_question` gibt `answernumbering: 'none'` zurück; Wert ist nie `abc`, `123` oder ein anderer Default.
- **KP-009 Patch:** `create_quiz` mit `mode: 'mini-check'` → `update_quiz_settings` mit nur `gradepass` → effektiver `mode` und `preferredbehaviour` bleiben `mini-check`-Werte. Negativtest: `update_quiz_settings` mit explizitem `mode: 'lernstandscheck'` ändert `preferredbehaviour` auf den lernstandscheck-Default.
- **KP-012 Quiz-Titel:** Bestehenden Mini-Check nur mit `name` umbenennen → Read-back zeigt den neuen Namen und unveränderte Fragenreihenfolge, Quiz-Settings, Bewertung, Abschluss und Sichtbarkeit.
- **KP-008 Aufgabenbeschreibung:** Bestehende abgabefreie Aufgabe mit Titel und HTML-Beschreibung aktualisieren → Read-back enthält den neuen HTML-Text und keine alte Überschrift oder iframe-URL. Ist der gespeicherte Text abweichend, schlägt der Aufruf fehl. Testseam bereits angelegt in `test/integration/assign-settings.integration.test.js` (vor der Reparatur rot nachgewiesen, siehe Task #318).
- Bestehende Quiz-Integrations-, Fragenbank- und MCP-Profil-Tests bleiben unverändert lauffähig (Regressionsprüfung).

## Out of Scope

- Bild-Upload in `answer`, `generalfeedback`, `correctfeedback`, `partiallycorrectfeedback`, `incorrectfeedback` (dokumentierter Erweiterungspfad, Filearea-Mechanik ist recherchiert).
- Löschen einzelner Bilder aus einer Filearea (nicht-destruktiver Ansatz; Ersetzen über Delete-vor-Write beim Upload).
- Audio-, Video- oder andere Nicht-Bild-Dateitypen in Fragen.
- Änderung des `answernumbering`-Werts über einen MCP-Parameter.
- Erstellen oder Löschen von Quiz-Slots und Fragen (Spec 0009, unveränderter Grundsatz).
- Implementierung, Deployment, Migration bestehender Kurse.

## Further Notes

- Wayfinder-Karte und Entscheidungshistorie: [Issue #280](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/280).
- Forschungsgrundlage KP-006: `docs/research/2026-08-14-fragen-bild-upload.md` (Branch `research/fragen-bild-upload`, Issue #281).
- Grilling-Entscheidungen KP-006: [Issue #284](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/284).
- KP-007 und KP-009 wurden beim Kartenzeichnen (Issue #280, Notes) entschieden; KP-012 im [Grilling: Bestehende Quiz-Aktivitäten gezielt umbenennen (KP-012)](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/317); KP-008-Ursache und Reparaturpunkt im [Task: Regression beim Aktualisieren der Aufgabenbeschreibung reproduzieren und eingrenzen (KP-008)](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/318).
- Vorbild für den Upload-Helper: `Plugin/src/local_coursepilot/classes/external/upload_assign_intro_image.php`.
- Vorbild für den Snapshot-und-Patch-Ansatz: `Plugin/src/local_coursepilot/classes/assign_settings.php` (Spec 0009).
- ADR 0007 (explizite Formularfelder für Aktivitäts-MCPs) gilt unverändert; diese Spec schreibt es für Quiz-Teilupdates weiter.
