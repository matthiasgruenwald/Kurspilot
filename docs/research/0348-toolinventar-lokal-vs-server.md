# Inventar der 46 lokalen Tools gegen den serverseitigen Stand

**Ticket:** [#348](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/348) ·
**Karte:** [#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346) ·
**Stand:** 2026-08-21

Tatsachenbasis, keine Bewertung und keine Entscheidung. Alle Zahlen sind gegen
den Quellcode belegt (Datei:Zeile).

## Quellenstand

| Quelle | Ref | Belegt |
|---|---|---|
| Lokaler MCP, 46 Tools | `origin/main` | `moodle-mcp.js:31-49` (Aggregation der 11 Tool-Module) |
| Webservices, auf denen der lokale MCP aufsetzt | `origin/main` | `Plugin/src/local_coursepilot/db/services.php` — 44 Funktionen (Zeilen 13–401) |
| Serverseitiges Plugin, 9 Lesetools | `origin/moodle-native-mcp` | `Plugin/src/local_kurspilot/db/services.php:32-106` |
| Spec zum Servermodell (V1, rein lesend) | `origin/moodle-native-mcp` | `docs/specs/0012-local-kurspilot-server-mcp.md` |

`lib/` und `moodle-mcp.js` sind auf `origin/main` und `origin/moodle-native-mcp`
**byte-identisch** (`git diff --stat origin/main origin/moodle-native-mcp -- lib/ moodle-mcp.js` → leer). Die
Zeilenangaben gelten daher für beide Branches.

### Zählung

- **46 Tools** insgesamt (`grep -c 'name: "moodle_' lib/*-tools.js`), verteilt auf
  11 Module: core 11, question-bank 11, assign 5, quiz 4, folder 3, je 2 für
  label/url/page/resource/choice/forum.
- **7 lesend** — genau die Tools mit `readOnly: true`:
  `moodle_get_modules` (`lib/core-tools.js:156`), `moodle_get_course_catalog`
  (`:175`), `moodle_get_sections` (`:247`), `moodle_get_question_categories`
  (`lib/question-bank-tools.js:67`), `moodle_get_question` (`:229`),
  `moodle_plan_question_category_cleanup` (`:273`), `moodle_plan_quiz_cleanup`
  (`lib/quiz-tools.js:136`).
- **38 schreibend.**
- **1 ohne Moodle-Kontakt:** `moodle_crop_image` (`lib/assign-tools.js:115`) ruft
  keinen Webservice, sondern nur `lib/image-crop.js` auf.

### Abweichung zur Spec-Grundlage

`docs/specs/0012-local-kurspilot-server-mcp.md` rechnet in Abschnitt 5.1 noch mit
**42 Tools** und in Abschnitt 4 mit „sechs dateisystemgebundenen Tools entfallen,
die übrigen 36 sind 1:1 abbildbar". Beide Zahlen sind überholt. Nach dem Stand
der Spec kamen vier Tools dazu:

| Tool | Commit | Datum |
|---|---|---|
| `moodle_plan_question_category_cleanup` | `0cb37c0` (#316) | 2026-08-17 |
| `moodle_upload_question_image` | `359ac5b` (#326) | 2026-08-18 |
| `moodle_import_questions_xml` | `cd4d800` (#327) | 2026-08-18 |
| `moodle_clone_activity` | `5fd733e` (#328), `6f15272` (#329), `f0d83d5` (#332) | 2026-08-18 |

Zusätzlich ist die Spec-Liste der „sechs dateisystemgebundenen Tools" unvollständig:
`moodle_upload_question_image` liest ebenfalls einen absoluten lokalen Pfad
(`lib/question-bank-tools.js:196`, `fs.readFileSync`). **Sieben** Tools lesen lokale
Dateien: `lib/assign-tools.js:170` und `:202`, `lib/question-bank-tools.js:196`,
`lib/folder-tools.js:43`, `lib/resource-tools.js:43` (zwei Tools) sowie
`moodle_crop_image`.

### Spalte „durch generisches Vehikel ersetzbar?"

Faktisches Kriterium, nicht bewertend:

- **V** — das Tool **setzt nur Feldwerte** auf einem Objekt (Modulformularfelder,
  Abschnittsfelder, Fragefelder). Ein Vehikel, das dieselben Felder exportiert und
  wieder importiert, transportiert dieselbe Information.
- **E** — das Tool steht **aus eigenem Recht**: es rechnet, prüft, aggregiert,
  versioniert, verschiebt Positionen oder überträgt Binärdaten. Es setzt keinen
  Feldwert, den ein Export zeigen könnte.
- **L** — lesend; liefert die Exportseite, ist selbst kein Vehikel-Thema.

Verteilung: **20 V**, **18 E** (beides schreibend), **7 L**, **1 rein lokal**.

---

## A. Modulanlage über Moodles Modulformular (`add_moduleinfo`/`update_moduleinfo`)

Diese zehn Tools laufen durch dieselbe Core-Pipeline wie `course/modedit.php`
(`grep -rl add_moduleinfo Plugin/src/local_coursepilot/classes/external/` → 9 Dateien;
`update_moduleinfo` → `update_assign.php`).

| Tool | Zweck (Lehrkraftsicht) | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_create_label` (`lib/label-tools.js:40`) | Text-/Medienfeld auf der Kursseite anlegen, z. B. farbige Phasen-Header | W | `local_coursepilot_create_label` → `add_moduleinfo` (`create_label.php`) | nein | **V** |
| `moodle_create_page` (`lib/page-tools.js:40`) | Textseite für Inhalte, die nur gelesen werden | W | `local_coursepilot_create_page` → `add_moduleinfo` | nein | **V** |
| `moodle_create_url` (`lib/url-tools.js:42`) | Link auf eine externe Webseite anlegen | W | `local_coursepilot_create_url` → `add_moduleinfo` | nein | **V** |
| `moodle_create_resource` (`lib/resource-tools.js:87`) | Datei-Ressource zum Herunterladen anlegen | W | `add_moduleinfo` **+** Dateibereich (`create_resource.php` nutzt `fileupload_helper`); liest lokale Datei (`lib/resource-tools.js:43`) | nein | **E** (Binärtransport) |
| `moodle_create_folder` (`lib/folder-tools.js:55`) | Verzeichnis für Materialsammlungen anlegen | W | `local_coursepilot_create_folder` → `add_moduleinfo` | nein | **V** |
| `moodle_create_choice` (`lib/choice-tools.js:30`) | Abstimmung für schnelle Meinungsbilder anlegen | W | `local_coursepilot_create_choice` → `add_moduleinfo` | nein | **V** |
| `moodle_create_forum` (`lib/forum-tools.js:26`) | Forum anlegen, Typ wählbar (general/qanda/eachuser/single) | W | `local_coursepilot_create_forum` → `add_moduleinfo` | nein | **V** |
| `moodle_create_assign` (`lib/assign-tools.js:218`) | Aufgabe anlegen; Preset `standard`/`übung`, ~40 Formularfelder einzeln setzbar | W | `local_coursepilot_create_assign` → `add_moduleinfo` | nein | **V** |
| `moodle_create_quiz` (`lib/quiz-tools.js:72`) | Quiz anlegen; Modus `mini-check`/`lernstandscheck`/`abschlusstest` als komplettes Settings-Bündel, 23 Einzel-Overrides | W | `local_coursepilot_create_quiz` → `add_moduleinfo` + direktes DB-Nachsetzen (`create_quiz.php`) | nein | **V** (Modus = Feldbündel) |
| `moodle_update_assign` (`lib/assign-tools.js:23`) | Bestehende Aufgabe patchen (Titel, Termine, Bewertung, Abgabetypen, Feedback) | W | `local_coursepilot_update_assign` → `update_moduleinfo` | nein | **V** |

## B. Direkte DB-Schreibung im Plugin + `rebuild_course_cache`

Diese Tools umgehen das Modulformular und schreiben die Instanztabelle bzw.
`course_modules` direkt (`grep -rl 'DB->update_record\|DB->set_field' …/external/` → 16 Dateien).

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_update_page` (`lib/page-tools.js:18`) | Titel/HTML einer Textseite ändern | W | `update_page.php:45` `$DB->update_record('page')` + `:52` `rebuild_course_cache` | nein | **V** |
| `moodle_update_label` (`lib/label-tools.js:18`) | HTML/Name eines Text-/Medienfelds ändern | W | direkte DB-Schreibung + Cache-Rebuild | nein | **V** |
| `moodle_update_url` (`lib/url-tools.js:18`) | Name/Ziel-URL eines Links ändern | W | direkte DB-Schreibung + Cache-Rebuild | nein | **V** |
| `moodle_update_choice` (`lib/choice-tools.js:57`) | Titel/Beschreibung/Optionen einer Abstimmung ändern | W | direkte DB-Schreibung (Optionen als Feldliste) | nein | **V** |
| `moodle_update_folder` (`lib/folder-tools.js:77`) | Name/Sichtbarkeit eines Verzeichnisses ändern | W | direkte DB-Schreibung | nein | **V** |
| `moodle_update_forum` (`lib/forum-tools.js:54`) | Titel/Beschreibung/Forumtyp ändern | W | direkte DB-Schreibung | nein | **V** |
| `moodle_update_resource` (`lib/resource-tools.js:55`) | Name ändern und/oder Datei einer Ressource austauschen | W | direkte DB-Schreibung **+** Dateibereich; liest lokale Datei (`lib/resource-tools.js:43`) | nein | **E** (Binärtransport) |
| `moodle_update_section` (`lib/core-tools.js:270`) | Name und HTML-Beschreibung eines Kursabschnitts setzen | W | `update_section.php:59` `$DB->update_record('course_sections')` | nein | **V** |
| `moodle_ensure_section` (`lib/core-tools.js:293`) | Fehlenden Abschnitt bei Bedarf anlegen, dann Name/Beschreibung setzen | W | `ensure_section.php`, direkte DB-Schreibung + `course/lib.php` | nein | **E** (prüft Existenz, entscheidet Anlegen vs. Setzen) |
| `moodle_set_completion` (`lib/core-tools.js:198`) | Abschlussverfolgung aktivieren (manuell / bei Einreichung / bei Bestehensgrenze) | W | `set_completion.php`, `$DB->set_field` auf `course_modules` | nein | **V** |
| `moodle_set_restriction` (`lib/core-tools.js:220`) | Aktivität sperren bis Voraussetzungen erfüllt sind; Spezialmodus „Quiz bestanden" | W | `set_restriction.php` baut `availability`-JSON, löst `grade_items` auf (`:118-132`), prüft Fremdbedingungen (`:102` `guard_existing_availability`), `$DB->set_field` (`:142`) | nein | **E** (rechnet + prüft) |
| `moodle_update_quiz_settings` (`lib/quiz-tools.js:104`) | Bestehendes Quiz patchen; optional kompletter Moduswechsel | W | `update_quiz_settings.php:117-119` → `quiz_settings::snapshot()/patch()/persist()`; `quiz_settings.php:155-185` schreibt `quiz`, `grade_items` und `course_modules` direkt | nein | **V** (reines Patch, mit Nachführung der Bewertungsobjekte) |

## C. Core-Kursseiten-API (`core_courseformat_update_course`)

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_update_activity_settings` (`lib/core-tools.js:127`) | Sichtbarkeit und/oder Gruppenmodus einer Aktivität setzen | W | Core-Webservice `core_courseformat_update_course`, Aktionen `cm_show`/`cm_hide`/`cm_nogroups`/`cm_separategroups`/`cm_visiblegroups` (`lib/core-tools.js:24-30`, `:147-151`) — **kein** `local_coursepilot_*` | nein | **V** |

## D. Positionsoperationen über `course/lib.php`

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_move_section` (`lib/core-tools.js:317`) | Abschnitt an eine andere Position schieben, ohne Inhalt zu ändern; Abschnitt 0 gesperrt | W | `move_section.php:71` `move_section_to()` | nein | **E** (Position, kein Feldwert) |
| `moodle_move_module` (`lib/core-tools.js:337`) | Aktivität vor/nach eine andere oder ans Abschnittsende schieben | W | `move_module.php:87` `moveto_module()` | nein | **E** (Position, kein Feldwert) |

## E. Duplikation (Core-`cm_duplicate` bzw. Backup/Restore)

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_clone_activity` (`lib/core-tools.js:361`) | Aktivität im selben Kurs oder kursübergreifend duplizieren, inkl. Plugin-Konfiguration, Bewertung, Completion, Voraussetzungen | W | Zwei Pfade: intra-Kurs über `core_courseformat_update_course` Aktion `cm_duplicate` (`lib/core-tools.js:400-404`), kursübergreifend über `local_coursepilot_clone_activity_to_course` (`clone_activity_to_course.php`, `backup_controller`/`restore_controller`). Nachbearbeitung: neue cmid per Vorher-/Nachher-Diff der Modulliste (`:397-411`), Rename über `core_update_inplace_editable` bzw. das jeweilige Update-Tool (`:41-57`), Sichtbarkeit über `cm_show`/`cm_hide`, kursübergreifend Entfernen der kaputten `availability` (#332, `:107`) | nein | **E** (mehrstufige Operation mit Nachbearbeitung und Hinweistexten) |

## F. Fragensammlung und Fragen (`core_question`, ADR 0001)

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_ensure_question_bank` (`lib/question-bank-tools.js:27`) | Benannte Kurs-/Projekt-Fragensammlung anlegen oder gleichnamige wiederverwenden (idempotent) | W | `ensure_question_bank.php`: SQL-Suche nach gleichnamiger Bank (`:47-62`), sonst `question_bank_helper::create_default_open_instance()` (`:80`) | nein | **E** (sucht, entscheidet, legt an) |
| `moodle_create_question_category` (`lib/question-bank-tools.js:45`) | Fragenbank-Kategorie in der Sammlung anlegen, idempotent (keine Dubletten) | W | `create_question_category.php`, `questionlib` + direkte DB-Schreibung | nein | **E** (idempotent, prüft) |
| `moodle_get_question_categories` (`lib/question-bank-tools.js:67`) | Alle Kategorien der Sammlung mit id, Name, Elternkategorie auflisten | **R** | `local_coursepilot_get_question_categories` | **ja** — `local_kurspilot_get_question_categories` (`db/services.php:60`), eigenständige Portierung, „Vertrag bleibt identisch" | L |
| `moodle_update_question_category` (`lib/question-bank-tools.js:86`) | Kategorie umbenennen und/oder in andere Sammlung/Elternkategorie verschieben, nicht-destruktiv | W | `update_question_category.php`, `questionlib` + direkte DB-Schreibung | nein | **E** (Verschiebung) |
| `moodle_create_mc_question` (`lib/question-bank-tools.js:110`) | Multiple-Choice-Frage anlegen (Einfach-/Mehrfachauswahl, Gewichte, Feedback) | W | `local_coursepilot_create_mc_question`; Normalisierung der Antwortstruktur lokal in `lib/mc-question.js` | nein | **V** (Fragefelder) |
| `moodle_update_mc_question` (`lib/question-bank-tools.js:142`) | MC-Frage als **neue Version** desselben Fragenbank-Eintrags speichern; alte Version bleibt für laufende Versuche gültig | W | `update_mc_question.php` + `mc_question_version.php` (gleiche `questionbankentryid`, neue `question`- und `question_versions`-Zeile, ADR 0001) | nein | **E** (versioniert) |
| `moodle_upload_question_image` (`lib/question-bank-tools.js:174`) | Lokales Bild in Fragetext oder Antwortfeedback hochladen, liefert `@@PLUGINFILE@@`-Snippet | W | `upload_question_image.php`, Dateibereich + Copy-on-Version; liest lokale Datei (`:196`) | nein | **E** (Binärtransport, zweiphasiges Muster) |
| `moodle_move_question` (`lib/question-bank-tools.js:211`) | Frage nicht-destruktiv in eine Zielkategorie verschieben, auch zwischen Sammlungen; alle Versionen/Dateien/Tags bleiben | W | `move_question.php`, Moodles Core-Verschiebepfad | nein | **E** (Verschiebung über Versionshistorie) |
| `moodle_get_question` (`lib/question-bank-tools.js:229`) | Aktuellste Version einer Frage per Name oder questionid liefern | **R** | `local_coursepilot_get_question` | **ja** — `local_kurspilot_get_question` (`db/services.php:67`) | L |
| `moodle_import_questions_xml` (`lib/question-bank-tools.js:253`) | Moodle-XML-Fragen (z. B. STACK) versionstreu importieren; Wiedererkennung über `idnumber`, Verdachtsfall blockt und braucht `allownew` | W | `import_questions_xml.php`: parst nur über `qformat_xml::readquestions()` (`:97`), schreibt bewusst **nicht** über `importprocess()`, um Versionstreue zu erhalten (`:23-46`) | nein | **E** — zugleich der einzige bereits existierende Vehikel-Prototyp (Import eines Fremdformats mit Abgleichregel) |
| `moodle_plan_question_category_cleanup` (`lib/question-bank-tools.js:273`) | Leere, blattlose Testkategorien auflisten; Kurspilot löscht nichts, liefert nur Moodle-Links zur manuellen Prüfung (#315) | **R** | `local_coursepilot_get_question_category_cleanup_plan` | **nein** — kein Gegenstück in `local_kurspilot` | L / **E** (aggregiert und prüft) |

## G. Quiz-Slots

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_add_questions_to_quiz` (`lib/quiz-tools.js:155`) | Fragen aus der Sammlung ins Quiz aufnehmen, als Referenz auf die jeweils aktuellste Version (`version=null`, ADR 0001); bereits enthaltene werden übersprungen | W | `add_questions_to_quiz.php:67` `quiz_add_quiz_question()`, Rückgabe der aktuellen Slots per SQL (`:94-106`) | nein | **E** (Slot-Operation mit Dublettenprüfung) |
| `moodle_plan_quiz_cleanup` (`lib/quiz-tools.js:136`) | Bei kleinerer neuer Quizversion die entfallenden Slots benennen; Kurspilot löscht nichts | **R** | `local_coursepilot_get_quiz_cleanup_plan` | **ja** — `local_kurspilot_get_quiz_cleanup_plan` (`db/services.php:74`), „Vertrag bleibt identisch" | L / **E** (rechnet die Differenz) |

## H. Dateibereiche (Base64-Transport aus dem lokalen Dateisystem)

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_upload_assignfile` (`lib/assign-tools.js:154`) | Lokale Datei als „Zusätzliche Datei" in eine Aufgabe hochladen | W | `upload_assignfile.php` (`fileupload_helper`); liest lokale Datei (`lib/assign-tools.js:170`) | nein | **E** |
| `moodle_embed_assign_image` (`lib/assign-tools.js:185`) | Lokales Bild in den Beschreibungs-Dateibereich einer Aufgabe laden **und** sichtbar in die Beschreibung einbetten | W | `upload_assign_intro_image.php` (Dateibereich + direkte DB-Schreibung des intro-HTML); liest lokale Datei (`:202`) | nein | **E** (Upload + HTML-Nachschreibung) |
| `moodle_upload_folder_file` (`lib/folder-tools.js:97`) | Lokale Datei in ein Verzeichnis laden, optional in ein Unterverzeichnis | W | `upload_folder_file.php` (Dateibereich + direkte DB-Schreibung); liest lokale Datei (`lib/folder-tools.js:43`) | nein | **E** |

## I. Kursstruktur lesen

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_get_sections` (`lib/core-tools.js:247`) | Alle Abschnitte eines Kurses (Name, Nummer, ID, Sichtbarkeit) | **R** | `local_coursepilot_get_sections` | **ja** — `local_kurspilot_get_sections` (`db/services.php:53`) | L |
| `moodle_get_modules` (`lib/core-tools.js:156`) | Alle Aktivitäten eines Kurses/Abschnitts mit cmid, Typ, Name | **R** | `local_coursepilot_get_modules` | **ja** — `local_kurspilot_get_modules` (`db/services.php:46`), „Vertrag (Feldnamen) bleibt identisch" | L |
| `moodle_get_course_catalog` (`lib/core-tools.js:175`) | Kompakte filterbare Katalogansicht: Abschnitte, Inhalte, Teststruktur, Sichtbarkeit, Abschluss, Voraussetzungen; `detail=full` liefert Vollinhalte | **R** | `local_coursepilot_get_course_catalog` | **ja** — `local_kurspilot_get_course_catalog` (`db/services.php:39`), eigenständige Portierung, „Der Vertrag (Feldnamen, Maskierung, detail=compact/full) bleibt bewusst identisch zum lokalen Werkzeug" | L |

## J. Ohne Moodle-Kontakt

| Tool | Zweck | R/W | Mechanismus | Serverseitig | Vehikel |
|---|---|---|---|---|---|
| `moodle_crop_image` (`lib/assign-tools.js:115`) | Lokale Bilddatei rechteckig zuschneiden, Ausschnitt als neue lokale Datei; danach separat hochladen | — | Kein Webservice. `lib/image-crop.js` ruft ImageMagick `convert` bzw. macOS `sips` (ADR 0005) | nein — kein serverseitiges Äquivalent möglich, da kein lokales Dateisystem | **E** |

---

## Serverseitiger Stand: die Gegenrichtung

`local_kurspilot` hat **9 Lesetools** (`db/services.php:32-106`). Nur **6** davon
entsprechen einem der 46 lokalen Tools:

| `local_kurspilot`-Tool | Lokales Gegenstück | Deckung |
|---|---|---|
| `list_courses` | **keins** — der lokale MCP hat kein Tool, das Kurse auflistet | neu |
| `get_course_catalog` | `moodle_get_course_catalog` | deckungsgleich (Vertrag laut Klassenkommentar identisch) |
| `get_modules` | `moodle_get_modules` | deckungsgleich |
| `get_sections` | `moodle_get_sections` | deckungsgleich |
| `get_question_categories` | `moodle_get_question_categories` | deckungsgleich |
| `get_question` | `moodle_get_question` | deckungsgleich |
| `get_quiz_cleanup_plan` | `moodle_plan_quiz_cleanup` | deckungsgleich |
| `list_context_files` | **keins als MCP-Tool** — lokal ist der Kontextbereich Dateisystemcode (`lib/local-context-paths.js`, `lib/kurspilot-index.js`), den die Skills über den Chat-Client ausführen | neu als Tool |
| `read_context_file` | dito | neu als Tool |

`local_kurspilot` ist eine **eigenständige Portierung ohne Laufzeitabhängigkeit**
auf `local_coursepilot` (Spec 0012, Abschnitt „keine Abhängigkeit"; im Code belegt in
`get_course_catalog.php`: eine direkte Delegation an die andere Klasse ist auf der
Spike-Instanz ein Fatal Error).

**Nicht serverseitig gedeckt:** `moodle_plan_question_category_cleanup` — das
einzige der 7 Lesetools ohne Gegenstück, entstanden mit #316 nach dem Spec-Schnitt.

**Deckungsgrad:** 6 von 46 lokalen Tools (13 %) haben ein serverseitiges Gegenstück.
Alle 38 schreibenden und `moodle_crop_image` sind ungedeckt, ebenso
`moodle_plan_question_category_cleanup`.

---

## Der Setup-Apparat (~5.750 Zeilen)

Spec 0012, Abschnitt 5.1, trennt den lokalen Node-Code in drei Blöcke und beziffert
Block 2 („Setup und Installation") mit **~5.750 Zeilen**. Die eigene Messung
(`wc -l`, Stand `origin/main`):

### Rein lokaler Startaufwand — entfällt im Servermodell vollständig

| Datei | Zeilen | Aufgabe (aus dem Dateikopf) |
|---|---|---|
| `lib/setup-render.js` | 1122 | HTML-Rendering der Setup-Seite; reine Funktionen |
| `lib/setup-browser-server.js` | 865 | Lokaler HTTP-Server für das Browser-Konfigurationsprogramm |
| `lib/setup-flow.js` | 816 | Nicht-interaktive Flow-Logik: Client-Erkennung, Credential-/Config-/Skill-Setup |
| `lib/skill-install.js` | 703 | Kopiert die vier Kurspilot-Skill-Adapter nutzerweit nach `~/.claude/skills` bzw. `~/.agents/skills` |
| `lib/mcp-config-setup.js` | 415 | Schreibt/mergt `claude_desktop_config.json`, `~/.codex/config.toml`, opencode-Config |
| `lib/update-check.js` | 347 | „Nach Updates suchen": App-Tarball-Hash und ImageMagick |
| `lib/shortcut-install.js` | 231 | Verknüpfung „Kurspilot konfigurieren" (Spotlight/Startmenü), Gatekeeper-freundlich |
| `lib/client-registry.js` | 206 | Erkennt installierte Codex-/Claude-/opencode-Clients auf dem Rechner |
| `lib/node-provision.js` | 182 | Beschafft eine passende Node-Binary (System-Node oder Tarball von nodejs.org) |
| `lib/app-provision.js` | 176 | Lädt und entpackt den GitHub-`main`-Tarball idempotent nach `~/.kurspilot/app` |
| `lib/uninstall-flow.js` | 103 | Vollständige Deinstallation, spiegelt `setup-flow.js` |
| `lib/setup-server-state.js` | 48 | Laufzeitzustand des Setup-Servers (`~/.kurspilot/setup-server.json`) |
| **Zwischensumme `lib/`** | **5214** | |
| `scripts/setup-kurspilot.js` | 307 | CLI-/Dialog-Einstiegspunkt in den Setup-Flow |
| `scripts/setup-mcp-config.js` | 210 | Einstiegspunkt für die MCP-Client-Konfiguration |
| `scripts/install-skills.js` | 161 | Einstiegspunkt für die Skill-Installation |
| `scripts/start-mcp.js` | 124 | Startwrapper, der URL/Token zur Laufzeit aus dem Schlüsselbund liest |
| `setup.ps1` | 125 | Windows-Bootstrap (Kollegiums-Installer, ADR 0008) |
| `scripts/bootstrap-app.js` | 118 | Bootstrap: Node beschaffen, App entpacken |
| `setup.sh` | 103 | macOS/Linux-`curl`-Bootstrap (Kollegiums-Installer, ADR 0008) |
| `scripts/uninstall-kurspilot.js` | 52 | Einstiegspunkt Deinstallation |
| **Zwischensumme Einstiegsskripte** | **1200** | |
| **Summe** | **6414** | |

Die Spec-Zahl ~5.750 entspricht dem `lib/`-Kern (5214) zuzüglich eines Teils der
Einstiegsskripte; sie nennt `update-check.js` und Browser-Setup-Server explizit,
`client-registry.js` und die beiden Bootstrap-Shellskripte nicht.

### Grenzfälle — lokal, aber inhaltlich mit Funktion

| Datei | Zeilen | Befund |
|---|---|---|
| `scripts/moodle-credentials.js` | 398 | Moodle-Token-Speicher (Schlüsselbund, ADR 0006). Rein lokaler Startaufwand, **aber** die Funktion — Authentifizierung der Lehrkraft gegen Moodle — wird gebraucht und ist serverseitig bereits als OAuth 2.1 gebaut (`Plugin/src/local_kurspilot/classes/oauth_lib.php`, `oauth/*.php`). |
| `lib/imagemagick-setup.js` | 536 | Erkennung/Installation von ImageMagick, hängt allein an `moodle_crop_image`. Da dieses Tool im Servermodell mangels lokalem Dateisystem entfällt, entfällt auch dieser Block. |

Mit beiden: **7.348 Zeilen** rein lokaler Start-/Betriebsapparat.

### Inhaltlich gebraucht — die Arbeitsbereichs-Schicht (Block 3)

Spec 0012 beziffert sie mit ~4.400 Zeilen; die Messung bestätigt das exakt:

| Gruppe | Dateien | Zeilen |
|---|---|---|
| 13 × `lib/kurspilot-*.js` | `arbeitsbereich` 323, `lerngruppenpaket` 323, `materialpaket` 316, `zip` 301, `umsetzen-guard` 291, `frontmatter` 279, `index` 266, `eingangspaket` 257, `context-resolver` 150, `workspace-config` 122, `sidecar` 92, `paket-tree` 83, `diff-hint` 71 | 2874 |
| `lib/journal.js` | Journalführung | 466 |
| `lib/local-context-setup.js` | Kontextvorlagen rendern und anlegen | 449 |
| `lib/local-context-paths.js` | Pfad-/Slug-Bildung, Traversierungsschutz | 383 |
| `lib/unterrichtsvorhaben-workspace.js` | Vorhabenordner | 253 |
| **Summe** | | **4425** |

Nicht in der Spec-Aufzählung, funktional derselben Schicht zugehörig:
`lib/unterrichtsvorhaben-status.js` (139 Zeilen, Statusbericht).

Spec 0012 hält zu Block 3 zwei Befunde fest, die für die Zuordnung tragend sind:
diese Module sind **keine MCP-Tools** — `moodle-mcp.js` lädt keines von ihnen —,
die Skills lassen stattdessen den Chat-Client Node-Code aus dem Repo ausführen; und
5 von 14 Skills hängen daran. Die Zielaufteilung der Spec: Pfadbildung, Frontmatter-Schema,
`personenbezug`-Markierung und Paketexporte ins PHP-Plugin, das Redaktionelle in
Skill-Prosa, absolute Pfade ersatzlos. Serverseitig existiert davon heute nur die
Leseseite (`list_context_files`, `read_context_file`).

### Weder Setup noch Arbeitsbereich

Inhaltstragende Hilfsmodule, die die Tools direkt speisen:
`lib/implementation-plan.js` (665), `lib/material.js` (385),
`lib/image-crop.js` (258), `lib/data-protection-allowlist.js` (191),
`lib/activity-registry.js` (166), `lib/question-edit-preview.js` (131),
`lib/ocr-review.js` (128), `lib/material-page.js` (114),
`lib/alt-text.js` (110), `lib/mc-question.js` (109),
`lib/mc-question-preview.js` (101).

MCP-Laufzeit (Block 1, entfällt mit `mcp.php`): `lib/mcp-server-runtime.js` (193),
`lib/activity-registry.js` (166, doppelt genannt), `lib/moodle-client.js` (43),
`lib/tool-registry.js` (23), `moodle-mcp.js` (116), plus 11 Einzelprofil-Entry-Points
(`moodle-mcp-*.js`).

---

## Offene Punkte, die diese Recherche sichtbar macht

Ohne Bewertung, nur als Befund:

1. Spec 0012 rechnet mit 42 Tools und einer Liste von sechs dateisystemgebundenen
   Tools. Beides stimmt nicht mehr (46 bzw. sieben).
2. `moodle_plan_question_category_cleanup` ist das einzige Lesetool ohne
   serverseitiges Gegenstück.
3. Der lokale MCP hat kein Tool, das Kurse auflistet; `local_kurspilot` hat eins.
   Die Werkzeugmengen sind also nicht ineinander enthalten.
4. `moodle_import_questions_xml` ist bereits ein generisches Import-Vehikel für
   einen Teilbereich (Fragen), mit einer expliziten Abgleichregel (`idnumber`,
   Verdachtsfall-Gate) und einer bewussten Abweichung vom Core-Importweg, um
   Versionstreue zu erhalten.
5. Für Aktivitäten gibt es heute **keinen** Export in irgendeiner Form; der einzige
   vorhandene strukturelle Transportweg ist Backup/Restore in
   `clone_activity_to_course.php`.
