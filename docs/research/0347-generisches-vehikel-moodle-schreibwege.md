# Recherche: Trägt ein generisches Export/Bearbeiten/Import-Vehikel die Moodle-Schreibwege?

- **Datum:** 2026-08-21
- **Ticket:** [#347](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/347) · **Karte:** [#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346)
- **Status:** reine Recherche. **Keine Empfehlung, keine Entscheidung** — nur Befund.
- **Quellenbasis Moodle:** lokaler Kern unter `/opt/moodle`, `$release = '5.0.8 (Build: 20260608)'`, `$branch = '500'` (`/opt/moodle/version.php:35,37`). Alle Moodle-Pfade unten sind absolut auf diesen Baum.
- **Quellenbasis Kurspilot:** `origin/main` (lokaler Node-MCP + `local_coursepilot`), `origin/moodle-native-mcp` (`local_kurspilot`).
- **Vorarbeiten im Repo, auf denen dieser Befund aufsetzt:**
  `docs/research/2026-08-14-aktivitaeten-duplizieren.md` (Branch `research/aktivitaeten-duplizieren`, Issue #283) und
  `docs/research/2026-08-14-fragen-xml-import.md` (Branch `research/fragen-xml-import`, Issue #282).

---

## 0. Bezugsgröße: die Schreibwerkzeuge, um die es geht

`origin/main` registriert 46 MCP-Tools (`git grep -oE 'name: "moodle_[a-z_]+"' origin/main -- lib/`).
Davon sind 7 rein lesend (`get_course_catalog`, `get_modules`, `get_question`, `get_question_categories`, `get_sections`, `plan_quiz_cleanup`, `plan_question_category_cleanup`) und 1 rein lokal ohne Moodle-Aufruf (`crop_image`, `lib/image-crop.js`). Es bleiben **38 schreibende Tools**, gruppiert:

| # | Gruppe | Tools | PHP-Zeilen in `local_coursepilot` |
|---|---|---|---|
| A | Aktivität anlegen (9) | `create_assign`, `create_choice`, `create_folder`, `create_forum`, `create_label`, `create_page`, `create_quiz`, `create_resource`, `create_url` | 1.574 |
| B | Aktivität ändern (10) | `update_assign`, `update_choice`, `update_folder`, `update_forum`, `update_label`, `update_page`, `update_quiz_settings`, `update_resource`, `update_url`, `update_activity_settings` | 943 + 580 (`assign_settings.php` 351, `quiz_settings.php` 229) |
| C | Kursstruktur (6) | `ensure_section`, `update_section`, `move_section`, `move_module`, `set_completion`, `set_restriction` | 737 |
| D | Klonen (1) | `clone_activity` | 231 (`clone_activity_to_course.php`) |
| E | Fragen (8) | `create_mc_question`, `update_mc_question`, `create_question_category`, `update_question_category`, `ensure_question_bank`, `move_question`, `import_questions_xml`, `add_questions_to_quiz` | 412 allein für `import_questions_xml` |
| F | Dateien/Bilder (4) | `upload_assignfile`, `upload_folder_file`, `upload_question_image`, `embed_assign_image` | — |

Gesamt `Plugin/src/local_coursepilot/classes/` (lesend + schreibend): **7.640 PHP-Zeilen**.

Kosten je zusätzlichem Werkzeug im Servermodell (`local_kurspilot`): eine External-Klasse **plus** je ein Eintrag in `Plugin/src/local_kurspilot/db/services.php`, in `dispatcher::TOOL_DESCRIPTIONS`, in `dispatcher::TOOL_SCHEMAS` und in `privacy_surface::ALLOWED_TOOLS` (letzteres per PHPUnit deckungsgleich erzwungen, siehe Kopfkommentar `Plugin/src/local_kurspilot/db/services.php:22-23`).

**Rechtemodell, gegen das jeder Weg zu prüfen ist (#338):**
`local_kurspilot` kennt genau zwei eigene Capabilities (`Plugin/src/local_kurspilot/db/access.php:28-46`):
`local/kurspilot:use` (`captype read`, `CONTEXT_COURSE`, Archetypen **`editingteacher` UND `teacher`**) und
`local/kurspilot:useremote` (`CONTEXT_SYSTEM`, dieselben Archetypen).
Die Moodle-Capabilities werden zusätzlich vom jeweiligen Werkzeug geprüft (Muster: `create_forum.php:67-68`, `clone_activity_to_course.php:113-121`).

---

## Weg 1 — Backup/Restore-API

### 1.1 Abdeckung

**Was der Weg strukturell kann.** Drei Granularitäten sind vorgesehen (`/opt/moodle/backup/backup.class.php:37-39`): `TYPE_1ACTIVITY`, `TYPE_1SECTION`, `TYPE_1COURSE`. Alle drei bauen einen vollständigen Plan (`/opt/moodle/backup/moodle2/backup_plan_builder.class.php:94-104`, Section-Plan `:197-214` rekursiv über alle Module der Section) und werden vom Restore gespiegelt (`/opt/moodle/backup/moodle2/restore_plan_builder.class.php:108-118`). Die Abschnittsebene ist also nicht bloß Theorie.

**Was er nicht kann: ändern.** Der Restore einer Aktivität ist ausnahmslos ein `INSERT`:

```php
$newitemid = $DB->insert_record('course_modules', $data);   // Zeile 4732
$this->set_mapping('course_module', $oldid, $newitemid);    // Zeile 4734
```
(`/opt/moodle/backup/moodle2/restore_stepslib.php:4732-4736`). Es gibt in `restore_stepslib.php` keinen Pfad, der ein bestehendes `course_modules`-Record per `update_record` fortschreibt. Es existiert kein `restore_target`, der „genau diese eine bestehende Aktivität aktualisieren" bedeutet: die fünf Ziele sind `TARGET_CURRENT_DELETING`, `TARGET_CURRENT_ADDING`, `TARGET_NEW_COURSE`, `TARGET_EXISTING_DELETING`, `TARGET_EXISTING_ADDING` (`/opt/moodle/backup/backup.class.php:97-101`); die beiden `*_DELETING`-Varianten löschen **den gesamten Zielkurs** vorab (`/opt/moodle/backup/controller/restore_controller.class.php:393-400` → `restore_dbops::delete_course_content()`, `/opt/moodle/backup/util/dbops/restore_dbops.class.php:1949-1951`), nicht selektiv eine Aktivität.

**Ergebnis Abdeckung:**

- **Ersetzbar:** Gruppe D (`clone_activity` — *läuft bereits so*, siehe 1.5) und, sofern eine Vorlagenquelle im selben Moodle existiert, die Anlage-Fälle aus Gruppe A. Auf Abschnittsebene könnte ein `TYPE_1SECTION`-Restore „Abschnitt samt Inhalt anlegen" in einem Zug leisten.
- **Nicht ersetzbar:** die gesamte Gruppe B (jede Änderung an einer bestehenden Aktivität), `set_completion`/`set_restriction`/`update_section` aus Gruppe C (betreffen bestehende Objekte), Gruppe E in versionstreuer Form, Gruppe F (Dateien kommen nur mit, wenn die Quelle sie bereits hat).
- **Netto:** Der Weg trägt „neu anlegen nach Vorbild", nicht „bearbeiten". Das Vehikel-Bild „exportieren → verändern → zurückschreiben" bricht am Zurückschreiben.

**Kein Core-Webservice.** In `/opt/moodle/lib/db/services.php` sind backupnah nur registriert: `core_backup_get_async_backup_progress` (`:77`), `core_backup_get_async_backup_links_backup` (`:86`), `core_backup_get_async_backup_links_restore` (`:95`), `core_backup_get_copy_progress` (`:104`), `core_backup_submit_copy_form` (`:113`) — allesamt UI-Fortschritts-/Formular-Helfer — sowie `core_course_duplicate_course` (`:531`) und `core_course_import_course` (`:654`). **Keine** Core-Funktion erzeugt eine `.mbz` zum Abholen oder nimmt eine entgegen; `duplicate_course()` löscht die erzeugte Datei am Ende sogar explizit (`/opt/moodle/course/externallib.php:1675`, `$file->delete();`).

Im Moodle-Tracker ist beides ausdrücklich abgelehnt bzw. zurückgestellt:

- [MDL-47776](https://moodle.atlassian.net/browse/MDL-47776) „Add core_backup_restore_activity webservice" — **Closed / Won't Do**, keine Fix-Version.
- [MDL-64914](https://moodle.atlassian.net/browse/MDL-64914) „Asynchronous course backup webservices" — **Closed / Deferred**, keine Fix-Version.

`core_course_import_course` ist die einzige Core-Funktion, die Backup+Restore als Webservice fährt (`/opt/moodle/course/externallib.php:1734-1873`): Kurs→Kurs, `TYPE_1COURSE` + `MODE_IMPORT`, `TARGET_EXISTING_ADDING` bzw. `_DELETING` (`:1802-1824`). Kein Dateihandling, keine Bearbeitungsstufe dazwischen, keine Aktivitäts- oder Abschnittsgranularität.

### 1.2 Rechte

Die geprüften Capabilities hängen am **Modus**, nicht nur am Typ.

*Modus `MODE_GENERAL` (echtes `.mbz`):*

| Capability | Kontext | riskbitmask | Default-Archetypen | Beleg |
|---|---|---|---|---|
| `moodle/backup:backupcourse` | COURSE | SPAM\|PERSONAL\|XSS | editingteacher, manager | `/opt/moodle/lib/db/access.php:151-163` |
| `moodle/backup:backupsection` | COURSE | dito | editingteacher, manager | `:165-177` |
| `moodle/backup:backupactivity` | **MODULE** | dito | editingteacher, manager | `:179-191` |
| `moodle/backup:downloadfile` | COURSE | dito | editingteacher, manager | `:207-219` |
| `moodle/restore:restorecourse` | COURSE | dito | editingteacher, manager | `:255-267` |
| `moodle/restore:restoresection` | COURSE | dito | editingteacher, manager | `:269-281` |
| `moodle/restore:restoreactivity` | COURSE | dito | editingteacher, manager | `:283-295` |
| `moodle/restore:uploadfile` | COURSE | dito | editingteacher, manager | `:323-335` |
| `moodle/backup:userinfo` | COURSE | PERSONAL | **nur manager** | `:233-242` |
| `moodle/restore:userinfo` | COURSE | SPAM\|PERSONAL\|XSS\|CONFIG | **nur manager** | `:359-368` |

*Modus `MODE_IMPORT` (in-process, kein Datei-Artefakt):* geprüft wird **ausschließlich** `moodle/backup:backuptargetimport` im Quellkurs (`/opt/moodle/backup/util/checks/backup_check.class.php:130-139`) bzw. `moodle/restore:restoretargetimport` im Zielkurs (`/opt/moodle/backup/util/checks/restore_check.class.php:92-101`). Die typspezifischen Caps aus der Tabelle werden in diesem Modus übersprungen.

**Datenschutz-Nebenbefund (passt zur Kartenvorgabe „Lernendendaten out of scope"):** Fehlt `moodle/backup:userinfo`, wird die Einstellung `users` nicht nur ignoriert, sondern zwangsweise auf `false` gesetzt und per `LOCKED_BY_PERMISSION` gesperrt (`/opt/moodle/backup/util/checks/backup_check.class.php:154-180`); analog auf Restore-Seite (`restore_check.class.php:116-140`). Eine Lehrkraft kann über diesen Weg strukturell keine Lernendendaten bewegen.

**Reibung mit dem Rechtemodell aus #338:** `local/kurspilot:use` ist auch dem Archetyp **`teacher`** (nicht-editierende Lehrkraft) erlaubt (`Plugin/src/local_kurspilot/db/access.php:33-37`). **Keine** der Backup/Restore-Capabilities ist `teacher` zugeordnet — sie enden alle bei `editingteacher`/`manager`. Ein Vehikel auf diesem Weg wäre für die `teacher`-Gruppe unbenutzbar, während die heutigen Lesetools für sie funktionieren. Die bestehende Praxis prüft die Backup-Caps zusätzlich zur Plugin-Cap explizit (`Plugin/src/local_coursepilot/classes/external/clone_activity_to_course.php:118-121`).

### 1.3 Verhalten

- **Nicht idempotent.** Jeder Restore erzeugt neue Objekte (1.1). Ein zweiter Aufruf mit demselben Paket erzeugt eine zweite Aktivität.
- **Keine Teiländerung.** Es gibt nur „anfügen" (`*_ADDING`) oder „Zielkurs vorher komplett leeren" (`*_DELETING`). Ein Feld-Diff/Merge existiert in `restore_stepslib.php`/`restore_dbops.class.php` nicht.
- **IDs.** Alt→Neu-Zuordnung läuft über die Tabelle `backup_ids_temp` und `set_mapping()`/`get_mappingid()` (`/opt/moodle/backup/moodle2/restore_stepslib.php:4667-4691, 4734`).
- **Dateien.** Kommen über `files.xml` + Item-ID-Mapping mit. `@@PLUGINFILE@@` wird nicht im Restore umgeschrieben, sondern erst zur Laufzeit über `file_rewrite_pluginfile_urls()` aufgelöst; kodierte interne Links laufen über `restore_decode_rule`/`restore_decode_content` (`/opt/moodle/backup/util/helper/restore_decode_rule.class.php:36-90`, `restore_decode_content.class.php:41-88`).
- **Fragen.** Der Restore-Pfad kennt — anders als der XML-Import (Weg 4) — ein echtes Matching bestehender Fragen über `question_categories.stamp` und einen Inhalts-Identitätshash (`/opt/moodle/backup/util/dbops/restore_dbops.class.php:660-745`). Modul-Kontext-Kategorien werden nachträglich verschoben (`restore_move_module_questions_categories`, `/opt/moodle/backup/moodle2/restore_stepslib.php:5561`).
- **Voraussetzungen — der Kern von #332.** `restore_update_availability` läuft immer als letzter Schritt, auch bei `TYPE_1ACTIVITY` (`/opt/moodle/backup/moodle2/restore_stepslib.php:868-931`; Final-Task auch für Aktivitätspläne, `restore_plan_builder.class.php:124`). Die Remapping-Regel je Bedingung, hier `availability_completion`:

  ```php
  $rec = \restore_dbops::get_backup_ids_record($restoreid, 'course_module', $this->cmid);
  if (!$rec || !$rec->newitemid) {
      // If we are on the same course (e.g. duplicate) then we can just use the existing one.
      if ($DB->record_exists('course_modules', ['id' => $this->cmid, 'course' => $courseid])) {
          return $res;
      }
      // Otherwise it's a warning.
      $this->cmid = 0;
      $logger->process('Restored item (' . $name . ') has availability condition on module that was not restored', \backup::LOG_WARNING);
  } else {
      $this->cmid = (int)$rec->newitemid;
  }
  ```
  (`/opt/moodle/availability/condition/completion/classes/condition.php:476-491`)

  Damit ist der Bug #332 **kein Fehler, sondern das dokumentierte Verhalten**: Ist das referenzierte Modul weder Teil des Pakets noch im Zielkurs vorhanden, setzt Moodle `cm = 0` und protokolliert eine Warnung. Kurspilot fängt das heute clientseitig ab und entfernt die Voraussetzung im kursübergreifenden Pfad (`lib/core-tools.js`, Commit `f0d83d5`, „fix(klon): kaputte Voraussetzung nach kursuebergreifendem Klon entfernen (#332)"). Ein Vehikel auf diesem Weg erbt diese Klasse von Problemen für jede cmid-tragende Referenz.
- **Export als Datei erfordert einen anderen Modus.** In `MODE_IMPORT` wird gar kein `.mbz` erzeugt: „On backup::MODE_IMPORT, we don't have to zip nor store the file, skip these steps" (`/opt/moodle/backup/moodle2/backup_final_task.class.php:145-148`), und das Temp-Verzeichnis wird bewusst behalten (`:157`). Ein Datei-Roundtrip braucht `MODE_GENERAL` — und damit die schwereren Caps aus 1.2.
- **MBZ-Format.** Ein ZIP über den Packer `application/vnd.moodle.backup` (`/opt/moodle/backup/moodle2/backup_stepslib.php:2315-2326`). Inhalt: `moodle_backup.xml`, `activities/<modname>_<cmid>/…` (Pfadschema `/opt/moodle/backup/moodle2/backup_activity_task.class.php:125-126`), `inforef.xml` je Aktivität, `files.xml`, `gradebook.xml`, `completion.xml`, `roles.xml`, `scales.xml`/`outcomes.xml`, `users.xml` nur bei aktivierten Nutzerdaten (Zusammensetzung in `/opt/moodle/backup/moodle2/backup_final_task.class.php:47-118`). Textuell editierbar, aber sämtliche IDs sind backup-lokal und werden beim Restore neu gemappt; Dateireferenzen müssen exakt zur SHA1-Ablage im Archiv passen.
- **Async ist kein Hindernis.** `MODE_IMPORT`/`MODE_SAMESITE` laufen immer `EXECUTION_INMEDIATE` (`/opt/moodle/backup/controller/backup_controller.class.php:167-170`, `restore_controller.class.php:133-137`); `enableasyncbackup` wirkt nur auf den interaktiven UI-Pfad (`/opt/moodle/backup/backup.php:50,121`).

### 1.4 Historie

Der Weg trägt **keine** Versionierung.

- Restore erzeugt neue Objekte statt neuer Stände desselben Objekts (1.1).
- Die Tabelle `course_modules` hat kein Änderungsdatum: ihre Felder sind `id, course, module, instance, section, idnumber, added, score, indent, visible, visibleoncoursepage, visibleold, groupmode, groupingid, completion, completiongradeitemnumber, completionview, completionexpected, completionpassgrade, showdescription, availability, deletioninprogress, downloadcontent, lang` (`/opt/moodle/lib/db/install.xml`, Abschnitt `TABLE NAME="course_modules"`) — `added` ist der Erstellzeitpunkt, es gibt kein `timemodified` und keine Historientabelle.
- Die einzige `*_versions`-Tabelle im Kern ist `question_versions` (`/opt/moodle/lib/db/install.xml:1495`); ein Äquivalent für Modulinstanzen existiert nicht.
- Eine Kette von `.mbz`-Ständen wäre vollständig Kurspilot-eigenes Sidecar: Ablage, Verkettung, Diff und Rückspielweg müssten selbst gebaut werden, und das Rückspielen bliebe „neu anlegen", nicht „Stand wiederherstellen".

### 1.5 Kosten

Belastbarer Anker, weil bereits gebaut: `Plugin/src/local_coursepilot/classes/external/clone_activity_to_course.php` fährt genau diesen Weg (Backup `TYPE_1ACTIVITY`/`MODE_IMPORT` → Restore `TARGET_CURRENT_ADDING`, cmid-Rückgewinnung über den alten Kontext) und kostet **231 Zeilen** inklusive Rechteprüfung, Temp-Cleanup und Section-Platzierung. Der Weg ist derselbe, den Moodle selbst in `duplicate_module()` geht (`/opt/moodle/course/lib.php:3136-3264`).

Größenordnung für ein *Vehikel*: je Ebene (Aktivität/Abschnitt) ein Adapter dieser Größe, plus zwei Teile, die es heute nirgends im Repo gibt — eine Datei-/Dokumentschicht (`MODE_GENERAL`, Dateiablage, Download/Upload, zusätzliche Caps) und eine Patch-Schicht auf dem entpackten XML samt Validierung. Gegengerechnet würde es Gruppe A (1.574 Zeilen) *nur dann* ablösen, wenn immer eine Vorlage vorliegt, und Gruppe B (1.523 Zeilen) **gar nicht**.

---

## Weg 2 — Modul-Formularweg

### 2.1 Abdeckung

**Der Schreibkern ist bereits generisch.** `add_moduleinfo()`/`update_moduleinfo()` rufen die Modulfunktion über Namenskonstruktion auf:

```php
$addinstancefunction = $moduleinfo->modulename."_add_instance";
$returnfromfunc = $addinstancefunction($moduleinfo, $mform);
```
(`/opt/moodle/course/modlib.php:141-143`; Update analog `:694-697`). Beide Funktionen erledigen generisch: `course_modules`-Record, Intro-Editor-Split, Dateibereiche des Intros, Tags, Abschnittszuordnung, Completion/Availability, Grade-Items über `edit_module_post_actions()` (`/opt/moodle/course/modlib.php:49-206` bzw. `:590-766`). Das Lesegegenstück `get_moduleinfo_data()` (`:792-888`) liefert den vollständigen Ist-Zustand inklusive Draft-Area für das Intro, Advanced-Grading-Status und Grade-Items/Outcomes.

**Kurspilot nutzt das bereits:** alle neun `create_*`-Werkzeuge gehen über `add_moduleinfo()` (z.B. `create_forum.php:105`, `create_page.php:78`, `create_quiz.php:642`), `update_assign` über `update_moduleinfo()` (`update_assign.php:80`), und `assign_settings.php:68-96` fährt exakt das Snapshot-und-Patch-Muster über `get_moduleinfo_data()`.

**Was pro Modultyp übrig bleibt** (und der Grund, warum es nicht schon heute ein Endpunkt ist):

1. **Feldliste mit Defaults.** `<modname>_add_instance()` bekommt `$moduleinfo` 1:1 durchgereicht und erwartet die Spalten der Instanztabelle. Beispiel `create_forum.php:73-103`: 25 Zeilen reine Feldzuweisung (`forcesubscribe`, `trackingtype`, `maxbytes`, `assessed`, `scale`, `warnafter`, `blockperiod`, `rsstype`, …). Diese Liste ist Wissen über den Modultyp, das irgendwo stehen muss.
2. **`data_postprocessing()`.** Normalisierungen, die nur im `mod_form.php` leben und nur beim echten `$mform->get_data()` laufen (`/opt/moodle/course/moodleform_mod.php:1194`; Implementierungen z.B. `/opt/moodle/mod/choice/mod_form.php:151-160`, `/opt/moodle/mod/data/mod_form.php:196`, `/opt/moodle/mod/feedback/mod_form.php:171`). Wer `add_moduleinfo()` mit `$mform = null` aufruft — wie Kurspilot und wie Core selbst in `create_module()`/`update_module()` (`/opt/moodle/course/lib.php:3040,3078`) — bekommt sie nicht.
3. **Module, die aus dem HTTP-Request lesen.** `forum_add_instance()` verwendet `file_get_submitted_draft_itemid('introeditor')` (`/opt/moodle/mod/forum/lib.php:124`, Update `:256`), liest also aus `$_POST` statt aus dem übergebenen Objekt. Ohne echte Formularübermittlung ist dieser Teil nicht generisch bedienbar.
4. **Module, die Felder nachrechnen.** `forum_update_instance()` setzt `timemodified`/`assesstimestart` selbst (`/opt/moodle/mod/forum/lib.php:175,182-185`).

**Formular-Introspektion ist möglich, aber ohne fertige API.** Die Kette ist `mod_<x>_mod_form` → `moodleform_mod` (`/opt/moodle/course/moodleform_mod.php:33`) → `moodleform` (`/opt/moodle/lib/formslib.php:131`), das eigentliche Formularobjekt ist `MoodleQuickForm` (`/opt/moodle/lib/formslib.php:1632`) → `HTML_QuickForm` (`/opt/moodle/lib/pear/HTML/QuickForm.php:102`). Auslesbar wären `$_elements` (`QuickForm.php:111`), `$_defaultValues` (`:168`), `$_rules` (`:216`), `getElement()` (`:757`), `isElementRequired()` (`:1393`), `exportValues()` (`:1873`), dazu `MoodleQuickForm::$_dependencies` (`formslib.php:1637`, für `disabledIf`) und `$_hideifs` (`:1642`, `protected`). **Aber:** `moodleform::$_form` ist `protected` (`/opt/moodle/lib/formslib.php:136`) und wird im Core von außen nirgends angefasst — Zugriff nur per Reflection. Eine High-Level-„beschreibe dieses Formular als Schema"-API existiert nicht; die Rekursion über Gruppen/Header/Hidden müsste selbst gebaut werden (Vorbild für die Unregelmäßigkeit: `_getElNamesRecursive()`, `/opt/moodle/lib/formslib.php:2918`).

**Kein Core-Webservice trägt das.**
- `core_form_dynamic_form` (`/opt/moodle/lib/db/services.php:957-961`) ist konzeptionell genau der generische Formular-Endpunkt, lehnt Modulformulare aber ab: `if (!class_exists($formclass) || !is_subclass_of($formclass, \core_form\dynamic_form::class)) { throw new \moodle_exception('nopermissionform', 'core_form'); }` (`/opt/moodle/lib/form/classes/external/dynamic_form.php:65-67`). `moodleform_mod` implementiert dieses Interface **nicht** (`/opt/moodle/course/moodleform_mod.php:33`, `abstract class moodleform_mod extends moodleform`).
- `core_courseformat_new_module` (`/opt/moodle/lib/db/services.php:596-603`) verlangt `plugin_supports('mod', $modname, FEATURE_QUICKCREATE)` (`/opt/moodle/course/format/classes/external/new_module.php:95`); im gesamten `/opt/moodle/mod/*/lib.php` deklariert das nur `mod_subsection`.
- `core_course_edit_module` und `core_courseformat_create_module` sind **deprecated** (`/opt/moodle/lib/db/services.php:612-620, 623-631`).

**Ergebnis Abdeckung:** Dieser Weg — und nur dieser — kann die Form „Ist-Zustand lesen → Dokument bearbeiten → zurückschreiben" für Aktivitäten tatsächlich abbilden, weil `get_moduleinfo_data()` und `update_moduleinfo()` dasselbe Objekt lesen und schreiben. Er könnte **Gruppe A (9) und Gruppe B (10)** hinter zwei Endpunkten bündeln. Er deckt **nicht** ab: Gruppe C (Abschnitte, Reihenfolge), Gruppe E (Fragen), Gruppe F (Dateiuploads jenseits des Intros).

### 2.2 Rechte

- `moodle/course:manageactivities` — `can_add_moduleinfo()` `/opt/moodle/course/modlib.php:534`, `can_update_moduleinfo()` `:564`; Definition `CONTEXT_MODULE`, `editingteacher` (`/opt/moodle/lib/db/access.php:983-993`).
- `mod/<modname>:addinstance` — `course_allowed_module()` `/opt/moodle/course/lib.php:1661,1677`, aufgerufen aus `modlib.php:545`.
- `moodle/course:activityvisibility` — `modlib.php:724` (nur Update); `CONTEXT_MODULE`, `editingteacher` (`access.php:995-1002`).
- `moodle/course:setforcedlanguage` — `modlib.php:76` (Add), `:605` (Update).

Das ist **genau die Cap-Menge, die die Kurspilot-Werkzeuge heute schon prüfen** (z.B. `create_forum.php:68`, `update_page.php:38`). Keine neue Rechteklasse, keine Reibung mit #338 über die bekannte hinaus: `moodle/course:manageactivities` liegt bei `editingteacher`, nicht bei `teacher` — aber das gilt schon heute für jedes Schreibwerkzeug und ist damit keine neue Einschränkung des Vehikels.

### 2.3 Verhalten

- **Teiländerung ist der Normalfall.** `update_moduleinfo()` lädt den bestehenden `$cm` und überschreibt nur explizit übergebene Felder, bevor es `$DB->update_record('course_modules', $cm)` schreibt (`/opt/moodle/course/modlib.php:616-672`). Für die Instanztabelle greift dieselbe Eigenschaft auf DML-Ebene: `update_record()` baut das `SET` ausschließlich aus den im Objekt vorhandenen Schlüsseln, die auch echte Spalten sind (`/opt/moodle/lib/dml/mysqli_native_moodle_database.php:1657-1689, 1705-1716`). Nicht übergebene Felder werden also **nicht** auf Default zurückgesetzt.
  Das ist keine ausdrückliche Garantie von `modlib.php`, sondern ein Nebeneffekt des generischen `update_record()`; Module mit eigener Nachrechnung (Punkt 4 oben) weichen ab.
- **Idempotent im praktischen Sinn:** derselbe Patch zweimal angewandt ergibt denselben Zustand (abgesehen von nachgerechneten Zeitstempeln).
- **IDs bleiben stabil.** Die `cmid` ändert sich nicht, `availability` wird als Feldwert geschrieben statt neu gemappt. Die Fehlerklasse aus #332 (dangling cmid, siehe 1.3) entsteht auf diesem Weg strukturell nicht.
- **Dateien.** Intro-Dateien laufen generisch über die Draft-Area (`modlib.php:167-177, 675-681`), aber nur wenn `plugin_supports(..., FEATURE_MOD_INTRO)`. Weitere Dateifelder liegen in `<modname>_add_instance()`/`_update_instance()` und sind damit modulspezifisch (Punkt 3 oben).

### 2.4 Historie

Trägt **keine**, aus demselben Grund wie Weg 1: keine `timemodified`-Spalte und keine Historientabelle in `course_modules`, keine `*_versions`-Tabelle für Modulinstanzen (`/opt/moodle/lib/db/install.xml`). Es gibt lediglich das Ereignis `course_module_updated` (`/opt/moodle/course/modlib.php:763`), das keine Feld-Diffs speichert.

Was der Weg allerdings *ermöglicht*, was Weg 1 nicht ermöglicht: Weil `get_moduleinfo_data()` einen vollständigen, stabil identifizierten Ist-Zustand liefert (cmid bleibt gleich), wäre ein Kurspilot-eigenes Sidecar hier ein Verlauf von Ständen **desselben Objekts** — bei Weg 1 wäre es ein Verlauf verschiedener Objekte. Ein Identitätsanker im Kern existiert mit `course_modules.idnumber` (Feldliste s.o.), er ist aber nicht versioniert und nicht eindeutigkeitsgesichert wie `question_bank_entries.idnumber` (Unique-Index `categoryidnumber`, `/opt/moodle/lib/db/install.xml:1492`).

### 2.5 Kosten

- Der teure Teil ist bereits bezahlt: Snapshot-und-Patch existiert für `assign` (`assign_settings.php`, 351 Zeilen) und `quiz` (`quiz_settings.php`, 229 Zeilen).
- Eine generische Variante ersetzt 19 Werkzeuge (Gruppen A+B, zusammen **3.097 PHP-Zeilen**) durch zwei Endpunkte plus eine Feldliste je Modultyp. Der Feldlisten-Anteil ist der Rest, der nicht wegfällt: rund 25 Zeilen je Modultyp (Muster `create_forum.php:73-103`), für neun Typen also grob 200–250 Zeilen Daten statt Code.
- Zusätzlich nötig, sonst gibt es keinen Weg dafür: eine Entscheidung, was mit `data_postprocessing()` und den `$_POST`-lesenden Modulen geschieht — das ist der Punkt, an dem „ohne Pro-Modul-Code" nachweislich endet.

---

## Weg 3 — Kursstruktur-Wege

### 3.1 Abdeckung

`core_courseformat_update_course` (`/opt/moodle/lib/db/services.php:604-610`) ist ein generischer Aktions-Dispatcher: er nimmt `action`, `courseid`, `ids[]`, optional `targetsectionid`/`targetcmid` und ruft `$actions->$action(...)` auf der `stateactions`-Klasse des Kursformats auf (`/opt/moodle/course/format/classes/external/update_course.php:108-120`).

Verfügbare Aktionen (`/opt/moodle/course/format/classes/stateactions.php`):
`cm_move` (:53), `section_move` (:153, deprecated seit 4.4), `section_move_after` (:172), `section_add` (:259), `section_delete` (:310), `section_hide` (:353), `section_show` (:372), `cm_show` (:418), `cm_hide` (:437), `cm_stealth` (:456), `cm_duplicate` (:533), `cm_delete` (:599), `cm_moveright` (:635), `cm_moveleft` (:654), `cm_nogroups` (:706), `cm_visiblegroups` (:725), `cm_separategroups` (:744), `section_content_collapsed`/`_expanded` (:822/:845), `section_index_collapsed`/`_expanded` (:868/:891), `cm_state` (:917), `section_state` (:970), `course_state` (:1030), `create_module` (:1160, deprecated seit 5.0), `new_module` (:1193).

**Der Weg ist bei Kurspilot bereits verdrahtet:** `core_courseformat_update_course` steht im Coursepilot-Dienst (`Plugin/src/local_coursepilot/db/services.php:458`).

- **Ersetzbar:** `move_module` (`cm_move`), `move_section` (`section_move_after`), Sichtbarkeitsanteile aller `update_*`-Tools, Gruppenmodus, Abschnitt anlegen/löschen (teilweise `ensure_section`).
- **Nicht ersetzbar:** `update_section` (Name und Zusammenfassung sind keine State-Action), `set_completion`, `set_restriction`, alles Aktivitätsinhaltliche, alle Fragen, alle Dateien.

**Das Lesegegenstück ist kein vollständiger Export.** `core_courseformat_get_state` (`/opt/moodle/lib/db/services.php:590`) liefert `{course, section[], cm[}}` (`/opt/moodle/course/format/classes/external/get_state.php:62-117`), aber nur strukturelle Anzeigedaten: Section führt `hassummary`/`rawtitle`, **nicht** den Summary-Volltext (`/opt/moodle/course/format/classes/output/local/state/section.php:77-109`); CM führt `hascmrestrictions` als Bool, **nicht** das `availability`-JSON, und keinerlei Modul-Instanzdaten (`/opt/moodle/course/format/classes/output/local/state/cm.php:73-119`). Zudem werden nur sichtbare Sections/CMs aufgenommen (`get_state.php:100,108`).

**Formprüfung:** `update_course` nimmt kein Zustandsdokument entgegen, sondern (Aktion, IDs, Ziel). Der Weg ist ein **Kommando-Bus**, kein Export/Bearbeiten/Import-Vehikel. Zusammen mit `get_state` ergäbe sich kein Round-Trip, weil die Lesesicht schmaler ist als die Schreibsicht.

Zum Vergleich: Kurspilots eigener Lese-Endpunkt `get_course_catalog` (`Plugin/src/local_kurspilot/classes/external/get_course_catalog.php`, 540 Zeilen) liefert bereits deutlich mehr als `get_state` — Vollinhalte bei `detail="full"`, Teststruktur, Abschluss und maskierte Voraussetzungen. Die Exporthälfte eines Vehikels existiert damit auf Kurspilot-Seite schon, ohne Core-Entsprechung.

### 3.2 Rechte

Die Endpunkt-Deklaration nennt `moodle/course:sectionvisibility, moodle/course:activityvisibility` (`/opt/moodle/lib/db/services.php:610`); die einzelne Aktion prüft zusätzlich selbst:

| Aktion | geprüfte Capability | Beleg |
|---|---|---|
| `cm_move`, `cm_delete`, `cm_moveright/left`, `cm_*groups` | `moodle/course:manageactivities` | `stateactions.php:65, 607, 680, 770` |
| `section_move_after` | `moodle/course:movesections` | `:187` |
| `section_add` | `moodle/course:update` (+ `movesections`, wenn nicht angehängt) | `:268, 286` |
| `section_delete` | `moodle/course:update` **und** `moodle/course:movesections` | `:319-320` |
| `section_hide/show` | `moodle/course:update` + `moodle/course:sectionvisibility` | `:398` |
| `cm_show/hide/stealth` | `moodle/course:activityvisibility` | `:488` |
| `cm_duplicate` | `moodle/backup:backuptargetimport`, `moodle/restore:restoretargetimport` | `:544, 553` |
| `new_module` | `moodle/course:update` | `:1204` |

Alle beteiligten Capabilities sind im `editingteacher`-Archetyp erlaubt: `moodle/course:update` (`/opt/moodle/lib/db/access.php:845-855`), `manageactivities` (`:983-993`), `activityvisibility` (`:995-1002`), `sectionvisibility` (`:1599-1607`), `movesections` (`:1639-1648`). Kein Konflikt mit #338 über den bekannten `editingteacher`-Schnitt hinaus.

### 3.3 Verhalten

- Aktionsbasiert und damit von Natur aus feingranular; kein Vollersatz.
- Idempotenz je Aktion unterschiedlich: `cm_hide` ist idempotent, `section_add` und `cm_duplicate` nicht.
- `course_modinfo` ist rein lesend (`/opt/moodle/lib/modinfolib.php`, keine schreibenden DML-Aufrufe; Konstruktor `:619`); jede Strukturänderung muss `rebuild_course_cache()` nachziehen (`/opt/moodle/lib/modinfolib.php:3079-3152`), was die Kurspilot-Werkzeuge tun (z.B. `update_page.php:52`).
- `availability` bleibt hier unberührt: das Feld ist JSON in `course_modules.availability` (`/opt/moodle/lib/db/install.xml:344`) bzw. `course_sections.availability` (`:388`), die cmid-Referenz steckt in der Bedingung (`/opt/moodle/availability/condition/completion/classes/condition.php:74-78, 98`). Keine State-Action schreibt es.

### 3.4 Historie

Trägt keine. Die State-Actions schreiben Zustand, kein Protokoll.

### 3.5 Kosten

Praktisch null für die abgedeckten Fälle — Core-Webservice, im Dienst bereits registriert (`Plugin/src/local_coursepilot/db/services.php:458`). Der Preis ist die geringe Abdeckung: von den 38 Schreibwerkzeugen berührt er etwa 4–6, und die eigentliche Inhaltspflege gar nicht.

---

## Weg 4 — Fragen-XML (`qformat_xml`)

### 4.1 Abdeckung

Produktiv seit #327 als `moodle_import_questions_xml` / `local_coursepilot_import_questions_xml` (412 Zeilen).

- **Ersetzt:** `create_mc_question` und `update_mc_question` für alle Fragetypen, die `qformat_xml` beherrscht — Kurspilot ist damit nicht mehr auf MC beschränkt.
- **Ersetzt nicht:** `create_question_category`, `update_question_category`, `ensure_question_bank`, `move_question`, `add_questions_to_quiz`.
- **Bekannte Grenze der ersten Ausbaustufe:** eingebettete `<file>`-Blöcke (base64-Bilder) werden nicht in echte Fragenbank-Dateien übernommen (Kopfkommentar `Plugin/src/local_coursepilot/classes/external/import_questions_xml.php:44-48`) — `upload_question_image` bleibt deshalb nötig.

**Generizität über Fragetypen: teilweise.** Die klassischen Core-Typen sind in `qformat_xml` hart verdrahtet (Import-Dispatch `/opt/moodle/question/format/xml/format.php:1036-1077`, Export-Switch `:1288-1567`). Alles andere läuft über die Konvention `import_from_xml()`/`export_to_xml()` je qtype (`/opt/moodle/question/format.php:297-325` bzw. `:881-891`), mit generischer Basisimplementierung über `extra_question_fields()`/`extra_answer_fields()` in `/opt/moodle/question/type/questiontypebase.php:1308-1353, 1361-1389`.

**Kein Core-Webservice.** Fragebezogen existieren nur `core_question_update_flag` (`/opt/moodle/lib/db/services.php:1729`), `core_question_get_random_question_summaries` (`:1737`), `core_question_move_questions` (`:3291`), `core_question_search_shared_banks` (`:3297`) sowie einzelne `qbank_*`-Funktionen (Status, Tags, Kategorien verschieben, Spaltenreihenfolge). `qbank_importquestions` und `qbank_exportquestions` haben **keine** `db/services.php`; Import/Export laufen nur über die Formularseiten `question/bank/importquestions/import.php` und `question/bank/exportquestions/export.php`.

### 4.2 Rechte

`moodle/question:add` im Kategoriekontext ist die einzige zusätzlich nötige Capability (Tab-Zuordnung `'import' => ['moodle/question:add']` in `/opt/moodle/question/classes/local/bank/question_edit_contexts.php:53-57`, durchgesetzt über `require_one_edit_tab_cap('import')` aus `/opt/moodle/question/bank/importquestions/import.php:34-36`). Definition `/opt/moodle/lib/db/access.php:1457-1466`, `editingteacher` erlaubt. Genau so prüft es das Plugin (`import_questions_xml.php:75-76`: `local/coursepilot:use` **und** `moodle/question:add`).

Für Export käme `moodle/question:viewall`/`viewmine` dazu (`question_edit_contexts.php:53-57`).

### 4.3 Verhalten

**Idempotent und teiländerbar — als einziger der vier Wege**, aber nicht dank des Core-Imports, sondern gegen ihn:

- Der Core-Import legt bei jedem Durchlauf neu an. Bei `idnumber`-Kollision in derselben Kategorie wird die `idnumber` kommentarlos verworfen und trotzdem ein neuer Eintrag mit `version = 1` geschrieben (`/opt/moodle/question/format.php:450-461, 469-483`).
- Kurspilot umgeht `qformat_default::importprocess()` deshalb bewusst: gelesen wird über die reine Parse-API `qformat_xml::readquestions()` (kein DB-Zugriff), geschrieben über `question_type::save_question()` mit vorab gesetzter `$question->id` — dann legt Moodle eine neue Version desselben `question_bank_entries`-Eintrags an (Begründung im Kopfkommentar `import_questions_xml.php:23-42`; Vorarbeit `docs/research/2026-08-14-fragen-xml-import.md`, Abschnitt 2).
- Wiedererkennung nur innerhalb der Zielkategorie, `idnumber` maßgeblich, Namens-Fallback nur ohne `idnumber`. Jeder unsichere Fall schreibt **nichts**, bis ein zweiter Aufruf mit `allownew=true` ihn bestätigt (`import_questions_xml.php:137-182`).
- Parse-Fehler brechen vor jedem Schreibvorgang ab, es gibt kein Teilergebnis (`import_questions_xml.php:78-86`).

Nebenbefund: Der **Backup/Restore**-Pfad (Weg 1) kennt für Fragen ein eigenes Matching über `question_categories.stamp` und einen Inhalts-Identitätshash (`/opt/moodle/backup/util/dbops/restore_dbops.class.php:660-745`) — also eine dritte, wieder andere Identitätsregel als XML-Import und als Kurspilot.

### 4.4 Historie

**Trägt sie — als einziger der vier Wege.** Grund ist nicht das Dateiformat, sondern dass das Fragen-Subsystem eine eigene Identitäts- und Versionsschicht im Kern hat: `question_bank_entries` (`/opt/moodle/lib/db/install.xml:1478-1494`, Unique-Index `categoryidnumber` auf `(questioncategoryid, idnumber)` `:1492`) und `question_versions` (`:1495-1508`, Versionsvergabe über `\question_bank\versions::get_next_version()`, `/opt/moodle/question/classes/versions.php:42`). Vgl. `docs/adr/0001-use-native-moodle-question-versioning.md`.

### 4.5 Kosten

Bekannt und abgeschlossen: 412 Zeilen für den kompletten Weg inklusive Identitätsprüfung und Verdachtsfall-Logik.

### 4.6 Was daran Vorbild ist, was Sonderfall

**Vorbild (übertragbar):**
1. **Trennung von Parsen und Schreiben.** `readquestions()` ist rein lesend; erst danach entscheidet der Adapter, was geschrieben wird. Deshalb gibt es kein Teilergebnis bei fehlerhaftem Dokument.
2. **Explizite Verdachtsfall-Regel.** Unsichere Identität schreibt nichts, sondern fragt zurück. Das ist Adapter-Logik, kein Core-Verhalten, und wäre auf jeder Ebene nachbaubar.
3. **Der Core-Standardpfad war unbrauchbar und wurde umgangen.** Die tragfähige Lösung entstand, indem man unterhalb des offiziellen Import-Einstiegs an die Objekt-API ging.

**Sonderfall (nicht übertragbar):**
1. **Die Identität kommt aus dem Kern.** `question_bank_entries.idnumber` ist eindeutigkeitsgesichert und trennt „Eintrag" von „Version". Für Aktivitäten gibt es nur `course_modules.idnumber` — kein Unique-Index, keine Versionstabelle.
2. **Es gibt ein vom Kern selbst gepflegtes, textuelles Austauschformat.** Für Aktivitäten ist das einzige Kern-Format die `.mbz`, und die ist ein ID-gemapptes ZIP, kein redigierbares Dokument (1.3).
3. **Der Geltungsbereich ist ein Objekt ohne Kursstruktur-Beziehungen.** Eine Frage hat keine cmid-Referenzen, keine Abschnittsposition, keine Voraussetzungen — genau die Bezüge, die Weg 1 bei Aktivitäten zerbrechen lassen (#332).

---

## 5. Querschnitt

**Die vier Wege beantworten zwei verschiedene Fragen.** Weg 1 und Weg 4 sind Wege, wie Inhalt *neu* in einen Kurs kommt; Weg 2 und Weg 3 sind Wege, wie Bestehendes *geändert* wird. Nur Weg 2 kann beides und liefert dabei die Dokumentform (`get_moduleinfo_data()` ↔ `update_moduleinfo()`).

**Kein einzelner Weg deckt alle 38 Schreibwerkzeuge ab.** Grobe Zuordnung:

| Gruppe | Weg 1 | Weg 2 | Weg 3 | Weg 4 |
|---|---|---|---|---|
| A Aktivität anlegen (9) | nur mit Vorlage | ja | nein (nur `mod_subsection`) | nein |
| B Aktivität ändern (10) | **nein** | ja | nur Sichtbarkeit/Gruppen | nein |
| C Kursstruktur (6) | teilweise (Section-Restore) | Completion/Availability ja, Rest nein | Verschieben/Sichtbarkeit ja, `update_section` nein | nein |
| D Klonen (1) | ja (bereits umgesetzt) | nein | intra-Kurs ja (`cm_duplicate`) | nein |
| E Fragen (8) | Matching per stamp/hash | nein | nein | Fragen ja, Kategorien/Bank nein |
| F Dateien (4) | kommen mit der Quelle | nur Intro | nein | Grenze bekannt |

**Zur Versionierung von Aktivitäten (offener Punkt der Karte #346):** Der Kern hat sie nicht und bietet keinen Aufhänger dafür — kein `timemodified` in `course_modules`, keine `*_versions`-Tabelle außer `question_versions`. Kein Weg trägt sie also von sich aus. Weg 1 und Weg 2 unterscheiden sich aber darin, worauf ein Kurspilot-eigenes Sidecar aufsetzen könnte: bei Weg 2 auf eine über die Zeit stabile `cmid`, bei Weg 1 auf eine Folge jeweils neuer Objekte.

**Rechtemodell (#338):** Nur Weg 1 bringt eine neue Capability-Klasse ins Spiel, und zwar eine, die der Archetyp `teacher` nicht hat — anders als `local/kurspilot:use`. Wege 2, 3 und 4 bleiben innerhalb der Capabilities, die die bestehenden Kurspilot-Werkzeuge ohnehin prüfen.

---

## 6. Offene Punkte und Unsicherheiten

Nicht als Tatsache zu behandeln:

1. **Zeilennummern** in `stateactions.php`, `restore_stepslib.php` und `modlib.php` sind der Stand `/opt/moodle` 5.0.8 und verschieben sich mit Moodle-Patches.
2. **Nicht empirisch geprüft:** ob ein `TYPE_1SECTION`-Backup/Restore über einen Webservice-Aufruf in derselben Weise durchläuft wie der `TYPE_1ACTIVITY`-Fall aus `clone_activity_to_course.php`. Die Planbauer-Belege sagen ja, verifiziert wurde nur der Aktivitätsfall.
3. **Nicht geprüft:** ob eine Bearbeitung der XML-Dateien im `MODE_IMPORT`-Temp-Verzeichnis zwischen `backup_controller::execute_plan()` und `restore_controller` mechanisch trägt. Der Weg ist strukturell offen (`backup_final_task.class.php:145-157` behält das Verzeichnis; `restore_controller` liest aus `$tempdir`, `/opt/moodle/backup/controller/restore_controller.class.php:35, 92-100, 160`), aber es gibt keinen Beleg im Kern, dass jemand das tut, und keine Prüfsummen-Analyse dazu.
4. **Nicht geprüft:** wie viele der 9 Modultypen tatsächlich `data_postprocessing()` überschreiben bzw. aus `$_POST` lesen — belegt sind `choice`, `data`, `feedback`, `bigbluebuttonbn` (postprocessing) und `forum` ($_POST). Für die übrigen von Kurspilot bedienten Typen wurde das nicht einzeln nachgesehen.
5. **Nicht geprüft:** ob die Reflection-basierte Formularintrospektion (2.1) auf allen `mod_*_mod_form`-Klassen ohne Seiteneffekte instanziierbar ist — Modulformulare erwarten im Konstruktor `$course`/`$cm` und rufen `definition()` auf, was je Modul DB-Zugriffe auslösen kann.

---

## 7. Quellen

**Moodle 5.0.8 (`/opt/moodle`)**

- `version.php:35,37`
- `backup/backup.class.php:37-39` (Typen), `:97-101` (Restore-Targets)
- `backup/moodle2/backup_plan_builder.class.php:94-104,197-214`; `backup/moodle2/restore_plan_builder.class.php:108-118,124`
- `backup/controller/backup_controller.class.php:143,151,167-170`; `backup/controller/restore_controller.class.php:35,92-100,133-137,160,393-400`
- `backup/util/checks/backup_check.class.php:50-75,110-152,154-180`; `backup/util/checks/restore_check.class.php:55-114,116-140`
- `backup/moodle2/backup_final_task.class.php:47-118,145-157`; `backup/moodle2/backup_stepslib.php:2296-2358`; `backup/moodle2/backup_activity_task.class.php:125-126`
- `backup/moodle2/restore_stepslib.php:868-931,4633-4636,4658-4762,5561`
- `backup/util/dbops/restore_dbops.class.php:660-745,1921-1941,1949-1951`
- `backup/util/helper/restore_decode_rule.class.php:36-90`; `restore_decode_content.class.php:41-88`
- `availability/condition/completion/classes/condition.php:74-78,98,469-493`
- `course/lib.php:517-519,558-606,629-638,677-692,705-836,1087-1141,1155-1205,1326ff,1661,1677,3040,3078,3136-3264`
- `course/modlib.php:49-206,141-143,534,545,564,590-766,616-672,675-681,694-697,724,763,792-888,902-963`
- `course/modedit.php:74,90,115,121,123,155-163,186-193,238`
- `course/moodleform_mod.php:33,1168-1169,1194`
- `course/format/classes/external/update_course.php:108-120`; `.../external/get_state.php:62-117`; `.../external/new_module.php:95`
- `course/format/classes/stateactions.php:53,153,172,187,259,268,286,310,319-320,353,372,398,418,437,456,488,533,544,553,599,607,635,654,680,706,725,744,770,822,845,868,891,917,970,1030,1081-1142,1160,1173,1193,1204`
- `course/format/classes/output/local/state/course.php:64-86`; `.../section.php:77-109`; `.../cm.php:73-119`
- `course/externallib.php:1509-1678,1577-1584,1598-1599,1624-1627,1675,1701-1873,1802-1824`
- `lib/db/access.php:151-163,165-177,179-191,193-205,207-219,233-242,255-267,269-281,283-295,309-321,323-335,359-368,845-855,983-993,995-1002,1446-1454,1457-1504,1599-1607,1639-1648`
- `lib/db/services.php:77-121,531-538,584-621,596-603,604-610,612-631,654-661,957-961,1729,1737,3291,3297`
- `lib/db/install.xml:344,388,1478-1494,1492,1495-1508` und Abschnitt `TABLE NAME="course_modules"`
- `lib/formslib.php:131,136,1632,1637,1642,2200,2254,2286,2424,2918,2980,3014`; `lib/pear/HTML/QuickForm.php:102,111,168,216,371,757,1377,1393,1409,1873-1899`; `lib/pear/HTML/QuickForm/element.php:132,163,286,334`
- `lib/form/classes/external/dynamic_form.php:31-127,65-67`; `lib/form/classes/dynamic_form.php:37,90,102,118,132,148`
- `lib/dml/mysqli_native_moodle_database.php:1657-1689,1705-1716`
- `lib/modinfolib.php:528,619,803,863,886,914,925,958,1177,3079-3152`
- `mod/forum/lib.php:124,175,182-185,256,268`; `mod/choice/mod_form.php:151-160`; `mod/data/mod_form.php:196`; `mod/feedback/mod_form.php:171`; `mod/subsection/lib.php` (einziger `FEATURE_QUICKCREATE`-Treffer)
- `question/format.php:297-325,340ff,450-461,469-483,603,881-891`; `question/format/xml/format.php:47,1036-1077,1288-1567`; `question/type/questiontypebase.php:1308-1353,1361-1389`; `question/classes/versions.php:42`; `question/classes/local/bank/question_edit_contexts.php:53-57`; `question/bank/importquestions/import.php:34-36,82-129`
- `admin/settings/courses.php:760-761`; `backup/backup.php:50,68-106,121`; `backup/util/helper/async_helper.class.php:206-215`

**Moodle-Tracker**

- [MDL-47776](https://moodle.atlassian.net/browse/MDL-47776) — „Add core_backup_restore_activity webservice", Closed / **Won't Do**, keine Fix-Version.
- [MDL-64914](https://moodle.atlassian.net/browse/MDL-64914) — „Asynchronous course backup webservices", Closed / **Deferred**, keine Fix-Version.

**Kurspilot (`origin/main`)**

- `lib/core-tools.js` (Toolliste, Klon-Nachbehandlung; Commit `f0d83d5` zu #332)
- `Plugin/src/local_coursepilot/classes/external/clone_activity_to_course.php:23-30,105-125,133-146,152-200,205-225`
- `Plugin/src/local_coursepilot/classes/external/import_questions_xml.php:23-48,63-86,75-76,137-182`
- `Plugin/src/local_coursepilot/classes/external/create_forum.php:65-115`; `create_page.php:78`; `create_quiz.php:642`; `update_assign.php:80`; `update_page.php:34-52`
- `Plugin/src/local_coursepilot/classes/assign_settings.php:68-96`
- `Plugin/src/local_coursepilot/db/services.php:430-475` (Funktionsliste des Dienstes, `core_courseformat_update_course` auf `:458`)

**Kurspilot (`origin/moodle-native-mcp`)**

- `Plugin/src/local_kurspilot/db/access.php:28-46`
- `Plugin/src/local_kurspilot/db/services.php:22-23,31-70`
- `Plugin/src/local_kurspilot/classes/dispatcher.php` (`TOOL_DESCRIPTIONS`, `TOOL_SCHEMAS`)
- `Plugin/src/local_kurspilot/classes/privacy_surface.php:55-65`
- `Plugin/src/local_kurspilot/classes/external/get_course_catalog.php` (540 Zeilen)

**Repo-Vorarbeiten**

- `docs/research/2026-08-14-aktivitaeten-duplizieren.md` (Branch `research/aktivitaeten-duplizieren`)
- `docs/research/2026-08-14-fragen-xml-import.md` (Branch `research/fragen-xml-import`)
- `docs/adr/0001-use-native-moodle-question-versioning.md`
