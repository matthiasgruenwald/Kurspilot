# Änderungsverlauf für Aktivitäten — gibt es das schon, und was gehört zu einem Stand dazu?

**Recherche zu [#358](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/358)**, Karte
[#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346).

- **Quellstand Moodle:** 5.0.8 (`/opt/moodle/version.php:35`, `$release = '5.0.8 (Build: 20260608)'`),
  Branch `MOODLE_500_STABLE`, Commit `3087780dc`. Derselbe Stand wie #347 und #355.
- **Messgrundlage:** laufende Instanz `moodle-docker-*` auf diesem Quellbaum — 22 Kurse, 495
  Aktivitäten, 6.144 Dateizeilen. Alle Größenangaben in Teil 5 sind dort gemessen, nicht geschätzt.
- **Pfade ohne Präfix** = Moodle-Quellbaum. Kurspilot-Dateien mit `Plugin/src/…` ausgewiesen.
- **Vorarbeiten, die hier nicht wiederholt werden:**
  `docs/research/0347-generisches-vehikel-moodle-schreibwege.md` (Branch `research/0347-generisches-vehikel`),
  `docs/research/0355-feldkatalog-modultypen.md` (Branch `research/0355-feldkatalog`).

---

## Ergebnis in einem Satz

**Muster nachbauen — aber nicht das der Fragenbank, sondern das des Notenbuchs.** Die Fragenbank
versioniert über eine Indirektionsschicht, die es für Aktivitäten nicht gibt und die man nicht
nachrüsten kann. Das Notenbuch versioniert über eine Schattentabelle mit Vollkopie je Schreibvorgang
— dieses Muster ist auf Modulinstanzen übertragbar, kostet gemessene **~1 KB gzip je Version**, und
das Zurückspielen ist bereits gebaut: es ist der Formularweg aus #349.

## Empfehlung

| | |
|---|---|
| **Übernehmen** | **Nein.** Kein Plugin und kein Kernbestandteil trägt den Anwendungsfall (Teil 1). |
| **Muster nachbauen** | **Ja** — Notenbuch-Schattentabelle (Teil 2.2), Aufhänger `course_module_updated` (Teil 4), Rückschreiben über `update_moduleinfo()` (#349). |
| **Nicht machbar** | Nur zwei Teilbereiche: `quiz`-Substanz nach dem ersten Versuch, und alles, was Lernendendaten berührt (Teil 3). |

**Größter Vorbehalt:** Der Verlauf wäre **nicht lückenlos ehrlich**. `course_module_updated` ist der
einzige Aufhänger, und er deckt den Formularweg ab — aber nicht Quiz-Inhaltsänderungen, nicht
Notenbuch-Eingriffe, nicht Restore und nicht direkte DB-Schreibvorgänge (Teil 4.3). Ein Verlauf, der
das nicht offenlegt, erfindet eine Chronik.

---

# Teil 1 — Gibt es das schon?

## 1.1 Kern: nein, und das ist belegbar

#347 hat es für `course_modules` bereits gezeigt (kein `timemodified`, keine Historientabelle). Zwei
Ergänzungen, die dort nicht standen:

- Die einzigen Historientabellen im Kern-Schema sind `user_password_history`, `scale_history`,
  `grade_outcomes_history`, `grade_categories_history`, `grade_items_history`, `grade_grades_history`
  (`lib/db/install.xml:969,1000,2084,2111,2144,2195`). **Fünf von sechs gehören dem Notenbuch.** Für
  Modulinstanzen existiert keine.
- Im Moodle-Tracker gibt es keinen Vorschlag für Aktivitätsversionierung. Die nächstliegenden Treffer
  sind [MDL-85149 „Course Backup Versions"](https://moodle.atlassian.net/browse/MDL-85149) — *Closed /
  Deferred* — und [MDL-87948 „Add course copy history"](https://moodle.atlassian.net/browse/MDL-87948)
  — *Open*, und dort geht es um eine Protokollierung von Kurskopien, nicht um Inhaltsstände.
  (Abfrage über `https://moodle.atlassian.net/rest/api/3/search/jql`, JQL `project=MDL AND summary ~ …`,
  Stand 2026-08-21.)

## 1.2 `tool_recyclebin` — kein Rückweg, sondern ein Wiedervorlagefach

Genau geprüft, weil das Ticket danach fragt:

| Frage | Befund | Beleg |
|---|---|---|
| Was hebt er auf? | Ausschließlich **gelöschte** Aktivitäten. Aufhänger ist `tool_recyclebin_pre_course_module_delete($cm)`, aufgerufen aus `course/lib.php:760` über `get_plugins_with_function('pre_course_module_delete')`. Es gibt keinen Aufhänger auf Änderungen. | `admin/tool/recyclebin/lib.php:148`, `course/lib.php:760` |
| In welcher Form? | Ein vollständiges `.mbz` je gelöschter Aktivität, `TYPE_1ACTIVITY` / `MODE_AUTOMATED`, mit erzwungenem `backup_auto_files = 1` — also **inklusive aller Dateien und Nutzerdaten**. | `admin/tool/recyclebin/classes/course_bin.php:125-137`, Kommentar `:117-126` |
| Wie lange? | `tool_recyclebin/coursebinexpiry`, **Standard `WEEKSECS` = 7 Tage**; Aufräumtask alle 30 Minuten. | `admin/tool/recyclebin/settings.php:40-45`, `admin/tool/recyclebin/db/tasks.php:27-30` |
| Nur Metadaten in der DB? | Ja — `tool_recyclebin_course` hat genau `id, courseid, section, module, name, timecreated`. Der Inhalt liegt als Datei im Dateibereich, **nicht** in der Datenbank. | `admin/tool/recyclebin/db/install.xml:7-23` |
| Ist er ein Rückweg? | **Nein.** `restore_item()` fährt `TARGET_EXISTING_ADDING` — es entsteht eine **neue** Aktivität mit neuer `cmid`, und der Papierkorbeintrag wird danach gelöscht. Genau das Kopien-Muster, das das Ticket ausschließt. | `admin/tool/recyclebin/classes/course_bin.php:268-275`, `:315` |
| Wer darf? | `tool/recyclebin:viewitems` / `:restoreitems` / `:deleteitems` | `admin/tool/recyclebin/db/access.php:29-48` |

**Fazit:** trägt den Anwendungsfall nicht. Er ist ein Undo für *Löschen*, mit 7 Tagen Haltbarkeit und
Kopien-Semantik beim Zurückholen. Er ist aber das **beste Formvorbild** für die Extrahierbarkeit
(Teil 6).

## 1.3 Kurs-Backup je Aktivität als Versionsablage

Der Weg ist strukturell da (`TYPE_1ACTIVITY`, `backup/backup.class.php:37`), und Kurspilot fährt ihn
bereits für `clone_activity_to_course` (231 Zeilen, #347 Abschnitt 1.5). Er scheitert an zwei Stellen:

1. **Restore ist ausnahmslos `INSERT`.** `$DB->insert_record('course_modules', $data)`
   (`backup/moodle2/restore_stepslib.php:4732`); es gibt kein `restore_target`, das „genau diese
   bestehende Aktivität aktualisieren" bedeutet (#347 Abschnitt 1.1). Ein `.mbz`-Rückspielen erzeugt
   also **immer** die sichtbare Kopie, die das Ticket ausschließt.
2. **Die Größe.** Ein `.mbz` je Version enthält den Dateibereich der Aktivität. Gemessen: Median
   **328 KB**, p90 **2,15 MB** Dateiinhalt je Modulkontext (Teil 5). Ein ZIP-Blob hat je Version einen
   eigenen `contenthash` und wird deshalb **nicht dedupliziert** (`lib/filestorage/file_system_filedir.php:111-112,173-175`
   — die Ablage adressiert ausschließlich über den Inhalts-Hash). Ein geänderter Satz Text kostet den
   vollen Dateisatz noch einmal. Das ist ~300× teurer als ein Zeilen-Schnappschuss.

## 1.4 `logstore` als Chronik ohne Rückweg

`logstore_standard_log` hält `eventname, objecttable, objectid, crud, contextid, userid, other,
timecreated` (`admin/tool/log/store/standard/db/install.xml:8-27`). Das Feld `other` enthält bei
`course_module_updated` genau drei Werte — `modulename`, `instanceid`, `name`
(`lib/classes/event/course_module_updated.php:36-38, 84-96`). **Keine Feldwerte.** Aus dem Log lässt
sich rekonstruieren, *dass* jemand am 3. März die Aktivität geändert hat, nie *was*.

Positiv: die Aufbewahrung ist standardmäßig unbegrenzt (`logstore_standard/loglifetime` Default `0`,
`admin/tool/log/store/standard/settings.php:50-52`; der Aufräumtask steigt bei `0` sofort aus,
`admin/tool/log/store/standard/classes/task/cleanup_task.php:47-50`). Als *Zeitachse neben* einem
Schnappschussverlauf ist das Log brauchbar — als Verlauf selbst nicht.

## 1.5 Plugin-Verzeichnis und GitHub

Das Plugin-Verzeichnis liegt seit Kurzem unter `https://marketplace.moodle.com/` (Weiterleitung
303 von `moodle.org/plugins/index.php`). Gesucht wurde dort nach `versioning`, `history`,
`undo changes activity`, `backup versions changes detected`; auf GitHub über `gh search repos`
(Themen `moodle-plugin`) und `gh search code`.

| Fund | Was es tut | Trägt es? |
|---|---|---|
| **`local_courseversion`** ([GitHub](https://github.com/lmshostingservices/moodle-local_courseversion)), Beschreibung: *„Version-controlled course templates with rollback and diff history"* | **Die Beschreibung trifft nicht zu.** Die vier Tabellen `local_cv_courses`, `local_cv_versions`, `local_cv_assessment_state`, `local_cv_audit_log` speichern **keinerlei Inhalt** — nur Versionsnummer, Status, Sperrgrund, Prüfdatum, Audit-Zeilen (`db/install.xml`). `local_courseversion_create_version_from()` (`lib.php:1111-1155`) legt ausschließlich einen Metadatensatz an. Die Beobachter auf `course_module_updated`/`_created`/`_deleted` **protokollieren nur blockierte Bearbeitungen** (`classes/observer.php:60-115`). | **Nein.** Es gibt weder Schnappschuss noch Diff noch Rollback. Es ist ein Freigabe-/Sperrwerkzeug für australische VET-Compliance (`tas_version`, ASQA). Dazu: 0 Sterne, angelegt 2026-07-31, Lizenz `NOASSERTION`, nicht im Plugin-Verzeichnis. |
| **`local_timemachine`** ([Marketplace](https://marketplace.moodle.com/)) | Sichert **ganze Kurse** einer Kategorie automatisch, wenn Inhaltsänderungen erkannt werden; hält bis zu 7 Versionen je Kurs in `moodledata/MoodleTimeMachine`, optional FTP. Oberfläche: „browsing, downloading and deleting backups". Moodle 4.5–5.0, admin-only. | **Nein.** Kursgranularität statt Aktivität, Lehrkräfte haben keinen Zugriff, 7 Versionen, und das Zurückspielen ist ein gewöhnlicher Kurs-Restore — also wieder Kopien. Als *Sicherheitsnetz* nützlich, als Änderungsverlauf nicht. |
| `local_backupftp`, `tool_vault`, `tool_brcli` | Sicherung/Migration ganzer Kurse bzw. Sites | Nein — keine Versionssemantik, keine Aktivitätsebene. |
| `qbank_history` (Kern) | Versionsliste **für Fragen** | Nein, aber das Muster ist Teil 2. |

**Nichts zum Übernehmen.** Das Feld ist leer, nicht besetzt — was auch bedeutet, dass ein
extrahiertes Plugin (Teil 6) eine echte Lücke füllen würde.

---

# Teil 2 — Wie macht es die Fragenbank, und was trägt davon?

## 2.1 Das Muster: Vollkopie plus Indirektionsschicht

Drei Tabellen, alle in `lib/db/install.xml`:

| Tabelle | Zeile | Rolle |
|---|---|---|
| `question_bank_entries` | `:1478` | Die **stabile Identität**. Felder: `questioncategoryid`, `idnumber`, `ownerid`, `nextversion`. Kein Inhalt. |
| `question_versions` | `:1495` | Die **Verkettung**: `questionbankentryid`, `version` (ab 1), `questionid`, `status` (`ready`/`draft`/`hidden`). |
| `question_references` | `:1509` | Die **Indirektion für Nutzer**: `usingcontextid`, `component`, `questionarea`, `itemid`, `questionbankentryid`, `version`. Kommentar zum Feld: *„Version number for the question where NULL means use the latest non-draft version."* |

Der Inhalt selbst bleibt in `question` — und **jedes Speichern legt eine komplett neue `question`-Zeile
an**. Der Kommentar an der Tabelle sagt es wörtlich: *„This table stores the definition of one version
of a question"* (`:1449`). Im Code:

```php
// Always creates a new question and version record.
$question->stamp = make_unique_id_code();
…
$question->id = $DB->insert_record('question', $question);
```
(`question/type/questiontypebase.php:436-471`)

Danach wird der **bestehende** Bank-Eintrag wiederverwendet, sofern die Frage schon einen hat
(`get_question_bank_entry($question->id)`, `:423`), und eine neue `question_versions`-Zeile mit
`versions::get_next_version($questionbankentryid)` angehängt (`:495-505`; die Hilfsklasse rechnet
`MAX(version) + 1`, `question/classes/versions.php:42-63`).

Auch die **Dateien** wandern mit: `file_save_draft_area_files(…, 'question', 'questiontext',
(int)$question->id, …)` schreibt in einen Dateibereich, dessen `itemid` die **neue** Fragen-ID ist
(`question/type/questiontypebase.php:511-522`). Jede Version bekommt ihren eigenen Dateibereich.

## 2.2 Das zweite Kernmuster: die Schattentabelle des Notenbuchs

Weniger bekannt, aber für uns das tragende: `lib/grade/grade_object.php` schreibt bei **jedem**
Insert, Update und Delete eine Vollkopie der Zeile in `<tabelle>_history`:

```php
$DB->update_record($this->table, $data);
if (empty($CFG->disablegradehistory)) {
    unset($data->timecreated);
    $data->action       = GRADE_HISTORY_UPDATE;
    $data->oldid        = $this->id;
    $data->source       = $source;      // 'mod/forum', 'manual', 'import', …
    $data->timemodified = time();
    $data->loggeduser   = $USER->id;
    $historyid = $DB->insert_record($this->table.'_history', $data);
}
$this->notify_changed(false, $isbulkupdate);
$this->update_feedback_files($historyid);
```
(`lib/grade/grade_object.php:253-267`; Insert-Zweig `:349-372`, Delete-Zweig `:288-301`)

Die Historienzeile ist die Fachzeile **plus fünf Metafelder**: `action`, `oldid`, `source`,
`loggeduser`, `timemodified` (`lib/db/install.xml:2144-2160`). Und auch hier werden die Dateien
mitversioniert: `copy_feedback_files($context, GRADE_HISTORY_FEEDBACK_FILEAREA, $historyid)` legt je
Historienzeile einen eigenen Dateibereich an (`lib/grade/grade_grade.php:1101-1103, 1126-1128`).

## 2.3 Was fragenspezifisch ist — und warum das Fragenbank-Muster nicht übertragbar ist

**Der entscheidende Unterschied ist nicht die Speicherung, sondern die Indirektion.**

Bei Fragen zeigt **kein** Nutzer direkt auf `question.id`. Ein Quiz-Slot zeigt über
`question_references` auf `questionbankentryid` + `version` (`lib/db/install.xml:1509-1526`). Deshalb
darf `question.id` je Version wechseln, ohne dass irgendetwas bricht.

Bei Aktivitäten ist genau das nicht so:

- `course_modules.instance` ist ein **direkter Fremdschlüssel** auf die Modulinstanz
  (`lib/db/install.xml:322 ff.`).
- Dieselbe `iteminstance` steht im Notenbuch (`grade_items.iteminstance` + `itemmodule`,
  `lib/db/install.xml:1996 ff.`) und wird in `get_moduleinfo_data()` genau so gesucht
  (`course/modlib.php:849-855`).
- Sub-Tabellen hängen an der Instanz-ID: `quiz_slots.quizid`, `quiz_feedback.quizid`,
  `quiz_sections.quizid` (`mod/quiz/db/install.xml`), `assign_plugin_config.assignment`,
  `choice_options.choiceid`.
- Dateibereiche verwenden `contextid` des Moduls, nicht die Instanz-ID.

Eine Indirektionsschicht nachzurüsten hieße, **jeden dieser Bezugspunkte umzuschreiben** — im Kern,
in jedem Modul, in jedem Drittplugin. Das ist keine Plugin-Aufgabe.

**Übertragbar ist dagegen das Notenbuch-Muster**, weil es genau ohne Indirektion auskommt: Die
produktive Zeile bleibt, wo sie ist und wie sie heißt; daneben steht eine Kopie mit Zeitstempel. Nichts
zeigt auf die Kopie.

## 2.4 Wie „Zurück zu Version N" in der Fragenbank tatsächlich funktioniert

Wichtig, weil es die Erwartung im Ticket korrigiert:

`qbank_history` hat **keine Rückspielaktion**. Die Sprachdatei kennt genau acht Strings, darunter
keinen für „wiederherstellen" (`question/bank/history/lang/en/qbank_history.php:26-33`); eine Suche
nach `revert`, `set_current_version` oder `delete_version` in `question/classes/` und
`question/bank/history/` liefert **null Treffer**.

Der Rückweg ist stattdessen: eine alte Version öffnen, speichern — und weil `save_question()` den
bestehenden Bank-Eintrag wiederfindet und `MAX(version)+1` anhängt, entsteht **Version N+1 mit dem
Inhalt von Version 3**. Der Verlauf wird nie zurückgespult, er wird **vorwärts fortgeschrieben**.

Genau dieses Verhalten ist für Aktivitäten die richtige Semantik und passt exakt zu #349: Ein
Zurückspielen ist ein gewöhnliches `update_moduleinfo()` mit alten Werten, die `cmid` bleibt stabil,
es entsteht keine sichtbare Kopie, und der Verlauf bekommt einen neuen Eintrag statt einen zu
verlieren.

## 2.5 Ein drittes Muster, der Vollständigkeit halber

`mod_wiki` versioniert seine Seiten in `wiki_versions` (`pageid`, `content`, `contentformat`,
`version`, `timecreated`, `userid` — `mod/wiki/db/install.xml`). Das ist die schlankste Form: eine
Verlaufszeile je Inhaltsfeld. Für uns nicht tragfähig, weil ein Aktivitätsstand nicht *ein* Feld ist
(Teil 3), aber es belegt, dass der Kern das Muster „Vollkopie in eigener Tabelle" an drei
unabhängigen Stellen selbst verwendet.

---

# Teil 3 — Was gehört zu einem Aktivitätsstand, und was lässt sich zurückschreiben?

Referenz für „ist schon im Schnappschuss": `get_moduleinfo_data()` (`course/modlib.php:792-886`) —
das ist der Stand, den Moodle selbst für das Bearbeitungsformular zusammenstellt, und den #349 als
wiedereinspielbar identifiziert hat. Er beginnt mit dem **vollständigen Instanz-Record**
(`$DB->get_record($module->name, ['id' => $cm->instance])`, `course/modlib.php:570`).

| Bestandteil | Gehört zum Stand | Rückschreibbar | Vorbehalt |
|---|---|---|---|
| **Modulinstanz-Record** (`page`, `quiz`, …) | **Ja**, vollständig | **Ja** — `update_moduleinfo()` reicht an `<mod>_update_instance()` durch (`course/modlib.php:695`) | Feldnamen ≠ Spaltennamen bei `quiz`; Pseudofelder ohne DB-Default bei `page`/`url`/`resource` (#355) |
| **`course_modules`-Record** | **Ja** (`visible`, `visibleoncoursepage`, `idnumber`, `groupmode`, `groupingid`, `showdescription`, `downloadcontent`, `lang`, `section`) | **Ja**, mit drei Einschränkungen | `lang` und `visible*` still verworfen ohne Fähigkeit; `groupmode` bei `groupmodeforce` übersteuert (#355 Abschn. 3–4). **`course_modules` hat kein `timemodified`** — der Zeitstempel muss vom Verlauf selbst kommen |
| **Intro (Text)** | **Ja** — als `introeditor` inkl. Entwurfsbereich (`course/modlib.php:823-827`) | **Ja**, aber **`introeditor` ist beim Update Pflicht**: `update_moduleinfo()` greift ohne `isset()` zu (`course/modlib.php:675-681`) | Ein Teil-Patch ohne `introeditor` läuft in einen PHP-Fehler; ein veralteter überschreibt neuen Text (#355 Abschn. 2.2) |
| **Dateien im Intro-Bereich** | **Ja**, über den Entwurfsbereich | **Ja** | — |
| **Dateien in den übrigen Bereichen** (`mod_resource/content`, `mod_folder/content`, `mod_page/content`) | **Nein** — `get_moduleinfo_data()` erfasst nur `intro` | **Teilweise** — nur über einen separaten Dateischritt außerhalb des Formularwegs | Bei `folder` **darf der Parametername `files` nie im Request stehen** (`mod/folder/lib.php:148` liest ungeschützt `$_REQUEST`, #355). Ein Versions-Dateibereich kostet nur Zeilen, keine Bytes (Teil 5) |
| **Tags** | **Ja** — `core_tag_tag::get_item_tags_array('core', 'course_modules', $cm->id)` (`course/modlib.php:818`) | **Ja** — `set_item_tags()` beim Update (`course/modlib.php:738-740`) | Wird nur geschrieben, wenn `isset($moduleinfo->tags)`; ein Schnappschuss ohne Tags lässt sie stehen, statt sie zu leeren |
| **`availability`** | **Ja** — als `availabilityconditionsjson`, nur bei `$CFG->enableavailability` (`course/modlib.php:820-822`) | **Ja**, und **sicher**: `new \core_availability\tree(json_decode(...))` prüft vor dem Schreiben (`course/modlib.php:656-664`) | Enthaltene `cmid`-Referenzen können ins Leere zeigen, wenn das Zielmodul zwischenzeitlich gelöscht wurde (#332/#347) |
| **`grade_items`: `gradepass`, `gradecat`, Outcomes** | **Ja** (`course/modlib.php:849-885`) | **Ja** | Nur diese drei. `grademax`/`grade` kommt aus dem Instanz-Feld und ist bei `quiz` über den Formularweg **gar nicht** änderbar (#355) |
| **`grade_items`: alles Übrige** (Umbenennung, Gewichtung, Aggregation, `hidden`, `locked`) | **Nein** | **Nein** über diesen Weg | Wird im Notenbuch geändert, nicht im Modulformular. Hat aber einen **eigenen** Verlauf: `grade_items_history` (Teil 2.2) |
| **`grade_grades`** (Noten der Lernenden) | **Nein** | **Nein** — und **soll nicht** | Grenze der Karte #346. Eigener Kernverlauf in `grade_grades_history` |
| **Erweiterte Bewertung** (Rubrik/Marking Guide) | **Ja**, aber **nur mit `moodle/grade:managegradingforms`** (`course/modlib.php:829-846`) | Nur die Methodenwahl (`advancedgradingmethod_<area>`) | Die **Rubrik-Definition selbst** liegt in `grading_definitions`/`grading_form_*` und ist nicht Teil des Stands. Fehlt die Fähigkeit, fehlt das Feld **stillschweigend** |
| **Vervollständigungs-*einstellungen*** | **Ja** (`completion`, `completionview`, `completionexpected`, `completionusegrade`, `completionpassgrade`, `completiongradeitemnumber`) | **Nur mit `completionunlocked = 1`** | **Die teuerste Falle.** Ohne das Feld werden die Einstellungen still verworfen (`course/modlib.php:625-634`); mit ihm ruft Moodle `$completion->reset_all_state($cminfo)` und **löscht die Vervollständigungsdaten aller Lernenden** (`course/modlib.php:744-750`, #355 Abschn. 2.1). `completionunlocked` ist ein reines Formularfeld und in `get_moduleinfo_data()` **nicht enthalten** |
| **Vervollständigungs-*daten* der Lernenden** (`course_modules_completion`) | **Nein** | **Nein** — und **soll nicht** | Grenze der Karte. Ein Rückspielen der Einstellungen kann sie **zerstören**, siehe Zeile darüber. Das ist der Punkt, an dem ein Versionswerkzeug warnen muss, statt zu handeln |
| **`quiz_slots` / `quiz_sections` / `quiz_feedback`** | **Nein** — kein Bestandteil von `get_moduleinfo_data()` | **Nur solange es keine Versuche gibt.** `structure::check_can_be_edited()` wirft `cannoteditafterattempts`, sobald `quiz_has_attempts()` wahr ist (`mod/quiz/classes/structure.php:400-418`, aufgerufen aus `remove_slot()` `:1057` und den übrigen Strukturänderungen `:851, :1035, :1346`) | **Harte Grenze.** Zusätzlich zeigen Slots über `question_references` auf Fragen-Versionen — ein Slot-Rückschreiben müsste die Fragenversion mitführen. Und: **jedes Update ohne `feedbacktext` löscht das Gesamtfeedback** (#355) |
| **Modul-Sub-Tabellen** (`assign_plugin_config`, `choice_options`) | **Nein** | **Ja**, aber über modulspezifische Pseudofelder, nicht als Feld | `assign`: 20 Einstellungen unter anderen Namen; fehlende Enable-Flags **schalten Plugins ab**. `choice`: `option[]`/`limit[]`/`optionid[]` sind ein Protokoll mit Löschsemantik (#355) |
| **Überschreibungen** (`quiz_overrides`, `assign_overrides`) | **Nein** | **Nein** über diesen Weg | Berühren Gruppen und einzelne Lernende — Grenze der Karte |
| **Kalendereinträge** | **Nein** | Indirekt: `<mod>_update_instance()` schreibt sie aus den Datumsfeldern neu | Kein eigener Stand nötig, aber ein Rückschreiben **verschiebt Termine im Kalender** — sichtbare Nebenwirkung |

## 3.1 Die zwei Linien, die ein Werkzeug nicht überschreiten darf

1. **`completionunlocked`.** Der Schnappschuss darf die Vervollständigungsfelder mitführen (er kann
   nicht anders — sie stehen in `course_modules`), aber das Zurückschreiben darf sie **nicht
   automatisch anwenden**. Entweder weglassen (dann bleiben sie still auf dem aktuellen Stand) oder
   nur nach ausdrücklicher, benannter Bestätigung mit Hinweis auf den Datenverlust.
2. **`quiz` mit Versuchen.** Sobald Versuche existieren, ist der inhaltliche Teil eines Quiz-Stands
   unerreichbar. Ein Werkzeug muss das **vor** dem Rückspielen prüfen (`quiz_has_attempts()`), nicht
   die Ausnahme abfangen.

---

# Teil 4 — Woran hängt ein Verlauf technisch?

## 4.1 Es gibt genau einen Aufhänger, und er kommt zu spät

`\core\event\course_module_updated` wird in `update_moduleinfo()` als **letzte Anweisung vor dem
Return** ausgelöst:

```php
$cm->name = $moduleinfo->name;
\core\event\course_module_updated::create_from_cm($cm, $modcontext)->trigger();
return array($cm, $moduleinfo);
```
(`course/modlib.php:762-765`)

Das Ereignis trägt **keine Feldwerte** — `create_from_cm()` setzt nur `objectid` (die `cmid`) und
`other` mit `modulename`, `instanceid`, `name`
(`lib/classes/event/course_module_updated.php:36-38, 84-96`; die Pflichtfeldprüfung `validate_data()`
`:82-96` listet genau diese drei).

**Folge:** Ein Beobachter kann nur den **Nachher**-Stand aus der Datenbank lesen. Ein
Vorher-Nachher-Diff ist nur möglich, indem man die *vorherige* gespeicherte Version heranzieht — was
genau das Notenbuch-Muster ist und funktioniert, solange die erste Version beim Anlegen entsteht
(`\core\event\course_module_created`, `course/modlib.php:199`).

## 4.2 Es gibt **keinen** Vorher-Aufhänger

Geprüft: Der Kern hat in Moodle 5.0 elf Hooks im Kursbereich (`course/classes/hook/`,
`course/format/classes/hook/`). Modulbezogen sind davon nur `after_cm_name_edited`
(`course/format/classes/hook/after_cm_name_edited.php`, ausgelöst `course/modlib.php:757-763`) und
`completion/classes/hook/after_cm_completion_updated.php`. Die Formular-Hooks
`core_course\hook\after_form_definition` / `after_form_submission` / `after_form_validation` gehören
zum **Kursformular**, nicht zum Modulformular — der Klassenkommentar verweist explizit auf
`create_course()`/`update_course()` (`course/classes/hook/after_form_submission.php:20-23`), und die
einzigen Auslöser stehen in `course/lib.php:2043, 2162`.

**Es gibt keinen `before_cm_updated`-Hook und kein `course_module_updating`-Ereignis.**

## 4.3 Was der Aufhänger **nicht** mitbekommt — die Ehrlichkeitslücke

Alle folgenden Wege ändern eine Aktivität, ohne `course_module_updated` auszulösen:

| Weg | Warum kein Ereignis | Beleg |
|---|---|---|
| **Quiz-Inhalt** (Fragen hinzufügen/entfernen, Seitenumbrüche, Abschnitte, Punkte) | `mod_quiz` löst **eigene** Ereignisse aus: `slot_created`, `slot_deleted`, `page_break_created`, `section_break_created`, `slot_grade_item_updated`, `quiz_repaginated` u. a. — **kein** `course_module_updated` | `mod/quiz/classes/event/` (39 Klassen) |
| **Notenbuch-Eingriffe** an `grade_items` der Aktivität | Löst `grade_item_updated` aus und schreibt `grade_items_history` — ein **getrennter** Verlauf | `lib/grade/grade_object.php:253-267` |
| **`set_coursemodule_groupmode()`, `set_coursemodule_idnumber()`** | Der PHPDoc sagt es selbst: *„Do not forget to trigger the event \\core\\event\\course_module_updated as it needs to be triggered manually"* | `course/lib.php:607-609`, `:628-638` |
| **Restore / Import / Duplizieren** | In `backup/moodle2/restore_stepslib.php` und `backup/util/` gibt es **keinen** Auslöser für `course_module_created`/`_updated` (Suche ohne Treffer). `duplicate_module()` löst nur `course_module_created` aus (`course/lib.php:3259`) | — |
| **Direkte `$DB->update_record()`** aus beliebigem Plugin, CLI-Skript, Ad-hoc-Task oder SQL | Kein Ereignis, kein Hook, keine Trigger in Moodles DML-Schicht | — |

**Positiv abgedeckt** sind dagegen: der Formularweg (`course/modlib.php:763`), das Umbenennen und
Ein-/Ausblenden über die Kursseite (`course/format/classes/local/cmactions.php:106`,
`course/format/classes/stateactions.php:510, 692, 778`), der Massenbearbeitungs-Webservice
(`course/externallib.php:3782, 3815`), die Vervollständigungs-Massenbearbeitung
(`completion/classes/manager.php:430`) und `course/mod.php:288, 303, 319, 340`.

Da der heutige Kurspilot-Schreibweg auf `update_moduleinfo()` umgestellt wird (#349), wären **alle
Kurspilot-Änderungen und alle Änderungen von Hand über das Modulformular** erfasst. Was fehlt, ist
Quiz-Substanz, Notenbuch und Restore.

**Konsequenz für die Ehrlichkeit des Verlaufs:** Die Lücke lässt sich nicht schließen, aber
**erkennen**. Weil jeder Schnappschuss vollständig ist, kann das Werkzeug beim nächsten Auslösen
prüfen, ob der aktuelle Zustand vom zuletzt gespeicherten abweicht — und die Differenz als
„außerhalb des Verlaufs geändert" ausweisen, statt sie stillschweigend der neuen Version zuzuschlagen.
Ein zusätzlicher Beobachter auf den `mod_quiz`-Slot-Ereignissen schließt die größte Einzellücke.

## 4.4 Zwei Fallen im Beobachter-Modell

1. **Beobachterfehler sind stumm.** `\core\event\manager::process_buffers()` fängt jede Ausnahme aus
   einem Beobachter ab und macht daraus ein `debugging(...)`
   (`lib/classes/event/manager.php:154-160`). Ein fehlgeschlagener Schnappschuss **blockiert den
   Schreibvorgang nicht und meldet der Lehrkraft nichts**. Das Werkzeug muss deshalb selbst prüfen, ob
   für die letzte Änderung eine Version existiert.
2. **Interne vs. externe Beobachter.** Interne Beobachter (`'internal' => true`) laufen **sofort**,
   auch innerhalb einer offenen Transaktion; externe werden bis zum Commit gepuffert und bei einem
   Rollback **verworfen** (`lib/classes/event/manager.php:110-150`, `:97-99`). `update_moduleinfo()`
   öffnet **keine** Transaktion (die einzige in `course/modlib.php` steht in `add_moduleinfo()`,
   `:127-203`). Ein **externer** Beobachter ist deshalb die richtige Wahl: beim Anlegen wird der
   Schnappschuss dann erst nach erfolgreichem Commit geschrieben, beim Aktualisieren ohnehin sofort.

---

# Teil 5 — Wie groß wird das?

Alle Zahlen gemessen auf der laufenden Instanz (22 Kurse, 495 Aktivitäten). Methode: je Aktivität
`course_modules`-Zeile + Instanz-Zeile + alle `files`-Zeilen des Modulkontexts + die Sub-Tabellen
(`quiz_slots`/`quiz_feedback`/`quiz_sections`, `assign_plugin_config`, `choice_options`) als JSON
serialisiert, roh und `gzencode(…, 6)`.

## 5.1 Vollstand je Version

| Modultyp | n | roh (Median) | roh (p90) | **gzip (Median)** | gzip (p90) |
|---|---|---|---|---|---|
| `url` | 15 | 836 B | 998 B | **464 B** | 524 B |
| `forum` | 25 | 1.059 B | 1.068 B | **470 B** | 486 B |
| `choice` | 9 | 1.200 B | 1.263 B | **466 B** | 498 B |
| `folder` | 10 | 1.656 B | 2.653 B | **678 B** | 826 B |
| `label` | 25 | 1.684 B | 3.075 B | **748 B** | 1.436 B |
| `resource` | 45 | 1.712 B | 1.739 B | **700 B** | 726 B |
| `page` | 54 | 2.243 B | 11.456 B | **1.031 B** | 3.183 B |
| `quiz` | 107 | 2.244 B | 3.574 B | **947 B** | 1.192 B |
| `assign` | 146 | 4.640 B | 14.457 B | **1.479 B** | 3.110 B |

**Größenordnung: rund 1 KB gzip je Version** für die typische Aktivität; `assign` das Doppelte.
Ausreißer nach oben sind Aktivitäten mit sehr viel eingebettetem HTML (`page` max 525 KB roh — eine
einzelne Seite mit Inline-Base64-Bildern, nach gzip 385 KB; das ist ein Datenproblem der Seite, nicht
des Verlaufs).

Bestandteile zum Nachrechnen: `course_modules`-Zeile 444 B (Median, n=495), `files`-Zeile 511 B,
`quiz_slots`-Zeile 137 B, `assign_plugin_config`-Zeile 106 B (Median 11 Zeilen je `assign`).

## 5.2 Über ein Schuljahr

Die Instanz hat 495 Module in 22 Kursen = **22,5 Aktivitäten je Kurs**. Die Zahl der Bearbeitungen je
Aktivität und Schuljahr ist **nicht gemessen** — hier als Annahme mit Bandbreite:

| Bearbeitungen je Aktivität/Jahr | je Kurs (22,5 Aktivitäten), gzip | 100 Kurse | 500 Kurse |
|---|---|---|---|
| 10 | 225 KB | 22 MB | 110 MB |
| 20 | 450 KB | 44 MB | 220 MB |
| 50 | 1,1 MB | 110 MB | 550 MB |

**Bezugsgröße:** Dieselbe Instanz hält heute schon **335 MB** eindeutigen Dateiinhalt für ihre 22
Kurse. Ein Vollverlauf über alle 495 Aktivitäten mit 20 Versionen kostet **~10 MB** — rund **3 %** der
bereits vorhandenen Dateimenge, und rund 0,4 % einer typischen Schulinstallation mit Video- und
PDF-Beständen. **Die Größe ist kein Argument gegen den Ansatz.**

## 5.3 Vollstände vs. Unterschiede

Ein Diff würde bei ~1 KB gzip je Version vielleicht 70–85 % einsparen — also einige Hundert Byte pro
Version. Dagegen steht: Rekonstruktion über eine Kette, Empfindlichkeit gegen jede Lücke im Verlauf
(Teil 4.3 zeigt, dass es Lücken **gibt**), und ein Diff-Format, das Moodle-Upgrades überleben muss.

**Empfehlung: Vollstände.** Der Nutzen des Diffs ist eine Anzeigefrage, keine Speicherfrage — man
berechnet ihn beim Ansehen aus zwei Vollständen, statt ihn zu speichern.

## 5.4 Dateien: warum Zeilen-Schnappschüsse so viel billiger sind als `.mbz`

Moodles Dateiablage adressiert ausschließlich über den Inhalts-Hash: die Ablagepfad-Berechnung ist
`get_fulldir_from_hash($contenthash) . '/' . $contenthash`
(`lib/filestorage/file_system_filedir.php:111-112, 173-175`). `create_file_from_storedfile()`
übernimmt `contenthash` und `filesize` unverändert aus der Quellzeile
(`lib/filestorage/file_storage.php:1095-1120`) — eine Kopie eines Dateibereichs erzeugt also
**nur neue `files`-Zeilen à 511 B, keine neuen Bytes**.

Empirisch auf dieser Instanz belegt: **6.144 `files`-Zeilen, aber nur 4.910 eindeutige
`contenthash`-Werte**; Summe aller `filesize`-Werte 417 MB, Summe der eindeutigen Inhalte 335 MB. Die
Deduplizierung ist real und misst hier bereits 20 %.

Ein `.mbz` je Version kann davon nicht profitieren: das ZIP ist ein einziger Blob mit eigenem
`contenthash`, der sich bei jeder noch so kleinen Änderung ändert. Bei Median **328 KB** und p90
**2,15 MB** Dateiinhalt je Modulkontext (n=175 der 495 Module haben überhaupt Dateien, Median 2
Dateien, p90 12) kostet eine `.mbz`-Version **rund das 300-fache** eines Zeilen-Schnappschusses.

---

# Teil 6 — Extrahierbarkeit

## 6.1 Der richtige Plugin-Typ ist `tool_`

Das Vorbild steht im Kern und macht genau das Gleiche eine Ebene weiter: **`tool_recyclebin`** ist ein
`admin/tool`-Plugin, das

- eigene Tabellen führt (`admin/tool/recyclebin/db/install.xml`),
- eigene Fähigkeiten definiert (`admin/tool/recyclebin/db/access.php:29-48`),
- eigene Admin-Einstellungen hat (`admin/tool/recyclebin/settings.php`),
- einen Aufräum-Task registriert (`admin/tool/recyclebin/db/tasks.php`),
- eigene Ereignisse auslöst (`admin/tool/recyclebin/classes/event/`),
- **pro Aktivität Inhalt im Dateibereich ablegt**, und
- sich über `tool_recyclebin_extend_navigation_course($navigation, $course, $context)` in die
  **Kursnavigation** hängt (`admin/tool/recyclebin/lib.php:35-80`) — sichtbar für Lehrkräfte, ohne
  ein `mod`-Plugin zu sein.

Das ist Zeile für Zeile die Form, die ein Aktivitätsverlauf braucht.

**Alternativen und warum sie schlechter passen:**

- `report_` (`report/<name>/lib.php`, `report_<name>_extend_navigation_course()`, belegt in
  `report/log/lib.php:38`, `report/completion/lib.php:35` u. a. — acht Kernreports) ist per Konvention
  **lesend**. Ein Werkzeug, das schreibt, gehört dort nicht hin.
- `local_` kann alles Gleiche und ist die freieste Wahl — aber ohne Aussage über den Zweck. Es ist die
  richtige Wahl **nur**, wenn der Verlauf Teil von `local_kurspilot` bleibt statt eigenständig zu
  werden.
- `qbank_` ist an die Fragenbank gebunden und scheidet aus.

**Empfehlung: intern zunächst innerhalb von `local_kurspilot` bauen, aber mit der Schnittebene eines
späteren `tool_`.** Das kostet beim Bauen nichts und beim Herauslösen fast nichts.

## 6.2 Was von Anfang an getrennt bleiben muss

Damit die Herauslösung später eine Verschiebung von Dateien ist und keine Umschreibung:

| Was | Warum |
|---|---|
| **Keine Kurspilot-Begriffe im Schema.** Tabellen tragen nur `cmid`, `versionnummer`, `zeitstempel`, `userid`, `quelle`, `payload`. | Das Notenbuch macht es genauso: `action`, `oldid`, `source`, `loggeduser` sind generisch (`lib/db/install.xml:2144-2150`). |
| **Ein `source`-Feld von Anfang an**, mit Werten wie `form`, `kurspilot`, `observer`, `restore`. | Genau das Feld, das `grade_object::update()` mitschreibt (`lib/grade/grade_object.php:259`). Ohne es lässt sich Teil 4.3 später nicht auswerten. |
| **Schnappschuss und Rückschreiben streng über `get_moduleinfo_data()` / `update_moduleinfo()`**, nie über eigene DB-Schreibwege. | Sonst erbt das Plugin die Fehlerbilder, die #355 dem heutigen Adapter nachgewiesen hat — insbesondere kaputtschreibbares `availability`. |
| **Kein MCP-, Webservice- oder Kurspilot-Aufruf im Beobachter.** Der Beobachter serialisiert und schreibt, sonst nichts. | Beobachterfehler sind stumm (Teil 4.4); alles, was scheitern kann, gehört aus dem Beobachter heraus. |
| **Die Oberfläche (Liste, Diff, Zurückspielen) getrennt von der Speicherung.** | Die Speicherung ist generisch, die Oberfläche ist der Teil, der Kurspilot-Geschmack tragen darf. |
| **Eigene Fähigkeiten** (`…:viewhistory`, `…:restoreversion`), nicht `local/kurspilot:use` mitbenutzen. | `local/kurspilot:use` gilt auch für den Archetyp `teacher` (`Plugin/src/local_kurspilot/db/access.php:33-37`); Zurückspielen setzt `moodle/course:manageactivities` voraus (`course/modlib.php:564`). |

## 6.3 Aufwandsschätzung

Anker: `Plugin/src/local_coursepilot/classes/assign_settings.php` = **351 Zeilen** für *einen*
Modultyp mit Schnappschuss + Rückschreiben (#355). Der generische Ersatz dafür ist bereits als #349
geplant und ist die Voraussetzung, nicht Teil dieses Aufwands.

Obendrauf für den Verlauf:

| Teil | Größenordnung |
|---|---|
| `db/install.xml` (eine Tabelle) + `db/upgrade.php` + `db/access.php` + `settings.php` | ~120 Zeilen |
| `db/events.php` + Beobachterklasse (3 Kernereignisse + Quiz-Slot-Ereignisse) | ~120 Zeilen |
| Serialisierung/Deserialisierung um `get_moduleinfo_data()` herum, plus Sub-Tabellen je Modultyp | ~150 Zeilen |
| Aufbewahrungs-Task (Versionen kappen) | ~60 Zeilen |
| Oberfläche: Versionsliste, Vergleich, Zurückspielen mit Warnungen (`completionunlocked`, `quiz_has_attempts`) | ~300–400 Zeilen |
| **Summe** | **~750–850 Zeilen** |

Das ist die **Schätzung eines Umfangs, keine Messung** — sie setzt voraus, dass #349 den generischen
Schreibweg bereits liefert.

---

# Unsicherheiten und offene Punkte

Ausdrücklich als solche markiert:

1. **Bearbeitungen je Aktivität und Schuljahr** ist eine Annahme (Teil 5.2), keine Messung. Die
   Bandbreite 10/20/50 deckt den plausiblen Bereich ab, aber die reale Zahl kennt nur eine Instanz mit
   laufendem Verlauf.
2. **Die Messinstanz ist keine repräsentative Schulinstanz.** 22 Kurse, 495 Module, deutlich mehr
   `quiz` (107) und `assign` (146) als `page` (54). Die Mediane je Modultyp sind belastbar, die
   Mischung über einen Kurs ist es weniger.
3. **`local_timemachine` wurde nur über die Marketplace-Beschreibung bewertet**, nicht am Quellcode —
   für das Plugin ist kein öffentliches Repository auffindbar. Der Ausschlussgrund (Kursgranularität,
   admin-only) steht aber wörtlich in der Beschreibung und ist unabhängig von Implementierungsdetails.
4. **Der Marketplace ist neu** (Weiterleitung von `moodle.org/plugins`) und seine Suche hat sich in
   den Tests als relevanzschwach erwiesen — mehrere Anfragen lieferten identische, thematisch
   unpassende Trefferlisten. Ein bislang unentdecktes Plugin ist nicht ausgeschlossen; die
   Kombination aus Marketplace-Suche, GitHub-Themensuche und Tracker-Abfrage macht es aber
   unwahrscheinlich.
5. **`mod_quiz`-Slot-Ereignisse als zweiter Aufhänger** sind hier nur als vorhanden nachgewiesen
   (`mod/quiz/classes/event/`), nicht auf Vollständigkeit geprüft. Ob sie **jede** Strukturänderung
   abdecken, wäre vor dem Bauen einzeln zu belegen.
6. **Grenze zwischen den beiden Kernverläufen nicht ausgearbeitet.** `grade_items_history` führt für
   Notenbuchänderungen bereits einen eigenen Verlauf. Ob ein Aktivitätsverlauf ihn anzeigen soll (und
   wie beide Zeitachsen zusammengeführt werden), ist offen.
7. **Verhalten beim Löschen einer Aktivität** ist nicht entschieden: Verlauf mitlöschen (wie
   `tool_recyclebin` nach dem Restore, `course_bin.php:315`) oder verwaist stehen lassen? Beides hat
   Datenschutzfolgen, die eine `privacy\provider`-Implementierung ohnehin erzwingt.
