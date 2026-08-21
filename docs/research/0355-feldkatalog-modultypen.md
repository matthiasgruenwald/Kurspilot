# Feldkatalog der neun Modultypen — Wertebereiche, Defaults und Fehlerbilder

**Recherche zu [#355](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/355)**, Karte
[#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346).
Quellstand: Moodle **5.0.8** (`/opt/moodle/version.php`, `$release = '5.0.8 (Build: 20260608)'`),
Kurspilot-Stand `origin/main`.

Alle Pfade ohne Präfix beziehen sich auf den Moodle-Quellbaum. Kurspilot-Dateien sind mit
`Plugin/src/local_coursepilot/…` ausgewiesen.

---

## Ergebnis in einem Satz

Der Feldkatalog trägt — aber er ist **kein Katalog von Feldern**. Die Hälfte dessen, was ein Modultyp
zum Schreiben braucht, sind Dinge, die keine Spalte haben: Pseudofelder, die das Modul beim Speichern
verlangt, Nebentabellen, Nachbearbeitungen und Prüfungen, die ohne Formular ersatzlos entfallen. Ein
Katalog, der aus `get_columns()` erzeugt wird, beschreibt bei sechs der neun Modultypen die falsche
Ebene.

## Ampel je Modultyp

| Modultyp | Ampel | Tragender Grund |
|---|---|---|
| `label` | 🟢 **grün** | 4 Fachspalten, zwei davon rechnet das Modul selbst nach. Einzige Regel: `introformat` prüfen. |
| `folder` | 🟢 **grün** | Alle Felder tolerante Ints, Dateien optional und formularfrei. Eine benannte Sperre: Parametername `files`. |
| `page` | 🟡 **gelb** | Vier Pflicht-Pseudofelder ohne DB-Default; beim Update muss ein `page`-Array synthetisiert werden. |
| `url` | 🟡 **gelb** | Die URL-Prüfung lebt ausschließlich im Formular; `displayoptions`/`parameters` werden bei jedem Schreiben neu erzeugt. |
| `resource` | 🟡 **gelb** | Hauptdatei ist Pflicht und nur über einen separaten Dateischritt erreichbar. |
| `choice` | 🟡 **gelb** | `option[]`/`limit[]`/`optionid[]` sind ein Sub-Tabellen-Protokoll mit Löschsemantik, kein Feld. |
| `forum` | 🟡 **gelb** | 25 von 29 Spalten deklarativ, aber `assesstime*` nur über ein Nicht-DB-Feld setzbar, `forcesubscribe=2` löst Massen-Mails aus. |
| `assign` | 🟡 **gelb**, oberer Rand | 20 Einstellungen liegen in `assign_plugin_config` unter anderen Namen; fehlende Enable-Flags **schalten Plugins ab**. |
| `quiz` | 🔴 **rot** | Feldnamen ≠ Spaltennamen, jedes Update ohne `feedbacktext` löscht das Gesamtfeedback, `grade` ist über den Formularweg nicht änderbar, und die Substanz (`quiz_slots`) ist gar kein Feld. |

**Acht von neun Modultypen sind tragbar**, sechs davon mit namentlich benannter Sonderbehandlung.
`quiz` fällt heraus — nicht als Modultyp, wohl aber als Vehikel-Kandidat: seine Einstellungen brauchen
weiterhin ein eigenes Werkzeug.

## Die fünf Befunde, die die Karte verschieben

1. **`availability` ist über den Formularweg gar nicht kaputtschreibbar.** Das in #355 als schlimmster
   Fall zitierte Fehlerbild — Kursseite unbenutzbar — setzt einen Schreibweg voraus, der
   `update_moduleinfo()` umgeht. Genau das tut der heutige Adapter. Der Umstieg beseitigt das
   Fehlerbild, statt es zu erben. → [Abschnitt 5](#5-availability--das-einzige-feld-mit-harter-vorabprüfung)
2. **`completionunlocked` ist die teuerste Falle des Vehikels.** Ohne das Feld werden alle
   Vervollständigungseinstellungen still verworfen; mit ihm werden die Vervollständigungsdaten der
   Lernenden gelöscht. → [Abschnitt 2.1](#21-completionunlocked--der-teuerste-fallstrick)
3. **Ein Teil-Patch ohne vollständigen Schnappschuss ist bei `assign` zerstörerisch** und bei `quiz`
   und `url` datenvernichtend. Der Schnappschuss ist Pflicht, nicht Kür.
4. **Die Annahme des Tickets zu `mod/choice/mod_form.php:151-160` stimmt nicht.** Die Methode fasst
   das Optionen-Array nicht an; die Optionsverarbeitung liegt in der lib und läuft formularlos
   unverändert. Umgekehrt liegt bei `folder` ein `$_REQUEST`-Zugriff **in der lib** statt im Formular.
5. **`assign_settings.php` ist bereits der handgeschriebene Prototyp des Vehikels** — 351 Zeilen für
   einen Modultyp. Das beziffert, was der Katalog einspart und was er nicht einsparen kann.

---

# Teil I — Der Rahmen, den alle Modultypen teilen

## 1. Der Formularweg ohne Formular

`add_moduleinfo($moduleinfo, $course, $mform = null)` (`course/modlib.php:49`) und
`update_moduleinfo($cm, $moduleinfo, $course, $mform = null)` (`course/modlib.php:590`) nehmen `$mform`
ausdrücklich optional. Beide reichen es nur an `<modul>_add_instance()` / `<modul>_update_instance()`
durch (`course/modlib.php:143`, `course/modlib.php:695`) — der Kommentar dort nennt es selbst einen
„hack to deal with files". Der Rest der beiden Funktionen arbeitet rein auf `$moduleinfo`.

`update_moduleinfo()` liest `$mform` außerdem an genau einer eigenen Stelle:
`$data = $mform->get_data()` (`course/modlib.php:594-596`), und benutzt `$data` ausschließlich für
`grade_rescalegrades` (`course/modlib.php:685-692`, `course/modlib.php:700-721`). Ohne Formular ist
`$data` ein leeres `stdClass` — Notenskalierung findet nicht statt, alles andere schon.

Moodle selbst geht denselben Weg: `create_module()` (`course/lib.php:3040`) und `update_module()`
(`course/lib.php:3078`) rufen mit `null` auf. **Der formlose Weg ist vorgesehen, nicht erschlichen.**
Der Preis steht in den folgenden Abschnitten.

`set_moduleinfo_defaults()` (`course/modlib.php:450-516`) füllt elf Lücken, die ein Vehikel deshalb
nicht selbst liefern muss: `groupingid`, `name`, `completion`, `completionview`, `completionexpected`,
`completiongradeitemnumber`, `completionpassgrade`, `visibleoncoursepage`, `downloadcontent`,
`conditiongradegroup`, `conditionfieldgroup`. Alles andere muss es liefern.

`$DB->insert_record()` filtert unbekannte Properties heraus
(`lib/dml/mysqli_native_moodle_database.php:1487`). Ein Vehikel kann also nie „danebenschreiben" — es
kann aber Felder **vergessen**, und bei NOT-NULL-ohne-Default endet das im DB-Fehler.

## 2. Was ohne Formular still ausfällt

### 2.1 `completionunlocked` — der teuerste Fallstrick

`update_moduleinfo()` schreibt die Vervollständigungsfelder nur, wenn `$moduleinfo->completionunlocked`
nicht leer ist (`course/modlib.php:625-634`):

```php
if (!empty($moduleinfo->completionunlocked)) {
    $cm->completion = $moduleinfo->completion;
    ...
}
```

`completionunlocked` ist ein **reines Formularfeld**: `$mform->addElement('hidden', 'completionunlocked', 0)`
(`completion/classes/form/form_trait.php:121`), auf `1` gesetzt nur, wenn die Lehrkraft im Formular
entsperrt (`completion/classes/form/form_trait.php:441,456`). `get_moduleinfo_data()` setzt es **nicht**
(`course/modlib.php:792-889` — die Feldliste enthält es nicht).

Folge für ein Vehikel:

- Patch auf `completion`, `completionview`, `completionusegrade`, `completionpassgrade` **ohne**
  `completionunlocked = 1`: **still ignoriert** (Fehlerbild a). Der Aufruf meldet Erfolg, es passiert nichts.
- Patch **mit** `completionunlocked = 1`: die Felder greifen — und `update_moduleinfo()` ruft danach
  `$completion->reset_all_state($cminfo)` (`course/modlib.php:744-750`), was **alle bereits erfassten
  Vervollständigungsdaten der Lernenden löscht und neu berechnet**.

Das ist die einzige Stelle im ganzen Querschnitt, an der ein Schreibvorgang **Lernendendaten anfasst** —
die die Karte #346 ausdrücklich außerhalb des Ziels führt. Der Katalog muss diese Felder deshalb
gesondert behandeln, nicht als gewöhnliche Instanzfelder.

`completionexpected` ist ausgenommen und wird immer geschrieben (`course/modlib.php:635-637`).

Dasselbe Feld steuert überdies modulinterne Normalisierungen: `choice` (`mod/choice/mod_form.php:154`),
`assign` (`mod/assign/locallib.php:1569-1571`) und `quiz` (`mod/quiz/lib.php:1055-1066`) hängen ihre
Completion-Bereinigung ebenfalls an `completionunlocked`.

### 2.2 `introeditor` ist beim Update de facto Pflicht

`update_moduleinfo()` greift für jedes Modul mit `FEATURE_MOD_INTRO` **unbedingt** zu
(`course/modlib.php:675-681`):

```php
$moduleinfo->intro = file_save_draft_area_files($moduleinfo->introeditor['itemid'], ...,
                                                $moduleinfo->introeditor['text']);
```

Kein `isset()`, kein Default. Ein `$moduleinfo` ohne `introeditor` läuft in einen PHP-Fehler; ein
`$moduleinfo` mit **veraltetem** `introeditor` überschreibt eine frisch gesetzte `intro`.
Auf dem Anlegeweg ist es dagegen bedingt (`course/modlib.php:133-139`, `course/modlib.php:169-177`) —
`introeditor` ist beim Anlegen optional, beim Aktualisieren nicht.

Die Gegenmaßnahme liefert Moodle selbst: `get_moduleinfo_data()` baut den Entwurfsbereich auf
(`course/modlib.php:823-827`). Wer den Schnappschuss darüber zieht, hat `introeditor` korrekt gefüllt.
Der heutige Adapter belegt genau das — und belegt zugleich, dass man den Fallstrick sonst tritt
(`Plugin/src/local_coursepilot/classes/assign_settings.php:96-101`):

> `update_moduleinfo() reads the description from introeditor, not from intro/introformat.`
> `Without this sync, the stale draft from snapshot() overwrites the new text.`

**Katalogregel:** `intro`/`introformat` sind keine patchbaren Felder. Patchbar ist `introeditor`, und
`intro` muss mitgezogen werden.

### 2.3 `validation()` greift nie

Jede Feldbedingung, die nur in `validation()` einer `mod_form`-Klasse steht, läuft bei `$mform = null`
nicht. Über alle neun Modultypen zusammengezählt sind das **elf** Regeln, die es sonst nirgends gibt —
am dichtesten bei `assign` (6) und `quiz` (3). Für jede wurde gegengeprüft, ob dieselbe Bedingung
außerhalb des Formulars nochmals geprüft wird: **nein**, in keinem einzigen Fall.

Das ist der Grund, warum der Katalog die **erste Wertprüfung überhaupt** sein muss (#349) — nicht
eine zusätzliche neben Moodles eigener.

### 2.4 `data_postprocessing()` greift nie

Gleiche Ursache: `data_postprocessing()` ist eine Methode von `moodleform_mod` und wird nur aus
`moodleform_mod::get_data()` aufgerufen. Vorhanden ist sie bei **drei** der neun Modultypen — `choice`
(`mod/choice/mod_form.php:151`), `forum` (`mod/forum/mod_form.php:524`), `quiz`
(`mod/quiz/mod_form.php:531`) —, und in allen drei Fällen normalisiert sie ausschließlich
Completion-Felder. `label`, `page`, `url`, `resource`, `folder` und `assign` haben sie gar nicht.

**Das ist deutlich harmloser als in #355 vermutet.** Die eigentlichen Fallstricke liegen woanders:
in den `*_instance()`-Funktionen der lib, die Pseudofelder ungeschützt lesen, und in `validation()`.

Zwei Stellen greifen **außerhalb** des Formulars direkt auf den Request zu:

| Stelle | Verhalten ohne Formular |
|---|---|
| `mod/forum/lib.php:124,250` | per `if ($mform and …)` sauber abgesichert — Block wird übersprungen |
| `mod/folder/lib.php:148` | **ungeschützt** in der lib; `file_get_submitted_draft_itemid('files')` liest `$_REQUEST` (`lib/filelib.php:881`) und ruft bei nicht-leerem Wert `require_sesskey()` (`lib/filelib.php:897`) |

Der zweite Fall ist eine harte Regel für das Vehikel: **der Parametername `files` darf bei einem
folder-Update nie im Request auftauchen.**

## 3. Rechteabhängige stille Auslassungen

Drei Felder werden ohne Fehlermeldung verworfen, wenn die aufrufende Person die Fähigkeit nicht hat:

| Feld | Fähigkeit | Ohne sie | Beleg |
|---|---|---|---|
| `lang` | `moodle/course:setforcedlanguage` | auf `null` gesetzt (Anlegen) bzw. gar nicht geschrieben (Update) | `course/modlib.php:76-80`, `course/modlib.php:605-609` |
| `visible`, `visibleoncoursepage` | `moodle/course:activityvisibility` | `set_coursemodule_visible()` wird übersprungen | `course/modlib.php:725-727` |
| Erweiterte Bewertung | `moodle/grade:managegradingforms` | Felder fehlen im Schnappschuss | `course/modlib.php:830-832` |

Alles Fehlerbild (a): still ignoriert. Der Katalog muss diese Felder als „rechteabhängig" führen,
sonst meldet das Vehikel Erfolg für etwas, das nicht passiert ist.

## 4. Kursweite Übersteuerungen

| Feld | Übersteuerung | Beleg |
|---|---|---|
| `groupmode` | bei `$course->groupmodeforce` wird der übergebene Wert verworfen (Anlegen: `0`; Update: alter Wert) | `course/modlib.php:58-60`, `course/modlib.php:611-613` |
| `completion*` | wird nur geschrieben, wenn `$completion->is_enabled()` für den Kurs | `course/modlib.php:83-94`, `course/modlib.php:621-638` |
| `availability` | wird nur geschrieben, wenn `$CFG->enableavailability` | `course/modlib.php:95-116`, `course/modlib.php:639-665` |
| `section` | bei Modultypen ohne `FEATURE_CAN_DISPLAY` zwangsweise `0` | `course/modlib.php:510-513` |

Ebenfalls durchgängig Fehlerbild (a). Ein Katalog, der nur Feldwerte kennt, kann diese vier nicht
erklären — sie hängen an Kurs und Serverkonfiguration, nicht am Modultyp.

## 5. `availability` — das einzige Feld mit harter Vorabprüfung

Anders als in #355 vermutet, prüft **schon der Schreibweg**: `update_moduleinfo()` und `add_moduleinfo()`
bauen `new \core_availability\tree(json_decode($cm->availability))` (`course/modlib.php:108-115`,
`course/modlib.php:656-664`). Der Konstruktor wirft `coding_exception` bei jedem Strukturfehler:
kein Objekt, fehlendes `->op`, unbekanntes `->op`, fehlendes oder nicht-Array `->showc`, `->showc`-Wert
nicht bool, fehlendes oder nicht-bool `->show` (`availability/classes/tree.php`, Konstruktor).

Damit gilt:

- **Über `update_moduleinfo()`** ist kaputtes `availability` **nicht** einschleusbar — Fehlerbild (e),
  laut und vor dem Schreiben, innerhalb der Transaktion (`course/modlib.php:127`).
- Der in #355 zitierte Katastrophenfall — `coding_exception('Invalid availability text')` beim Rendern,
  Kursseite unbenutzbar (`availability/classes/info.php:138-143`) — setzt einen Schreibweg voraus,
  der `update_moduleinfo()` **umgeht**. Genau das tut der heutige Adapter (Abschnitt 6).

**Der Umstieg auf den Formularweg beseitigt das schlimmste bekannte Fehlerbild dieser Karte.**
Das ist ein Argument für #349, das dort noch nicht stand.

## 6. Ausgangsstand: der heutige Adapter schreibt uneinheitlich

Auf `origin/main`, `Plugin/src/local_coursepilot/classes/external/`:

| Werkzeug | Schreibweg |
|---|---|
| `create_page` und die übrigen `create_*` | `add_moduleinfo()` — Formularweg |
| `update_assign` | `update_moduleinfo()` — Formularweg |
| `update_page`, `update_label`, `update_resource`, `update_forum`, `update_choice`, `update_quiz_settings` | `$DB->update_record()` auf der Instanztabelle + `$DB->set_field('course_modules', 'visible', …)` |

Belege: `create_page.php:78`, `update_assign.php:80`, `update_page.php:45,49`, `update_label.php:45,49`,
`update_resource.php:99,102`, `update_forum.php:87`, `update_choice.php:133`, `update_quiz_settings.php:120`.

Daraus folgt für die Recherchefrage „wo baut der heutige Adapter die Nachbearbeitung implizit nach":
**auf dem Anlegeweg durchgängig, auf dem Aktualisierungsweg nur bei `assign`.** Alle übrigen
Aktualisierungen schreiben an `update_moduleinfo()` vorbei und damit an Kalender, Bewertungsobjekten,
Ereignissen, `set_coursemodule_visible()` und der `availability`-Prüfung vorbei. Sie kompensieren das
mit `rebuild_course_cache($cm->course, true)`.

Bei `quiz` ist die Umgehung sogar **notwendig**: `grade` und `sumgrades` sind über
`update_moduleinfo()` nicht änderbar (`mod/quiz/lib.php:145-146`). Siehe Teil IV, §3.5.

## 7. `assign_settings` ist der bereits gebaute Prototyp des Vehikels

`Plugin/src/local_coursepilot/classes/assign_settings.php` (351 Zeilen) hat genau die Form, die #349
beschlossen hat — für einen einzigen Modultyp, von Hand:

- `snapshot($cm, $course)` (`:65`) — `get_moduleinfo_data()` plus das, was dort fehlt: `gradepass` und
  `gradecat` aus `grade_items` (`:69-76`), alle Zeilen aus `assign_plugin_config` (`:77-80`), die aktive
  erweiterte Bewertungsmethode (`:81-83`). Der Kommentar sagt den Zweck: „Loads all core and subplugin
  settings, so a partial patch cannot erase them."
- `patch($moduleinfo, $params)` (`:89`) — Sentinel-Logik, nur ausdrücklich übergebene Werte greifen.
- vier `validate_*`-Methoden (`:183`, `:222`, `:245`, `:290`) — handgeschriebene Wertprüfung.

**Das ist die Tatsache, die den Katalog rechtfertigt:** Schnappschuss und Patch sind generisch und
brauchen keinen Katalog. Von Hand geschrieben werden müssen die `validate_*`-Methoden und die
Zusatzquellen im Schnappschuss. Der Katalog ersetzt die erste Hälfte durch Daten; die zweite Hälfte
ist genau das, was die Ampel je Modultyp entscheidet.

## 8. Textformate — der einzige generische Wertebereich

`FORMAT_MOODLE=0`, `FORMAT_HTML=1`, `FORMAT_PLAIN=2`, `FORMAT_WIKI=3`, `FORMAT_MARKDOWN=4`
(`lib/weblib.php:42-65`). Zulässig sind nur 0, 1, 2, 4 — `FORMAT_WIKI` ist tot.

**Aufrufbar:** `format_text_menu()` (`lib/weblib.php:464-469`) liefert genau diese vier. Damit ist
`introformat`/`contentformat` der einzige Wertebereich im ganzen Katalog, der bei **allen neun**
Modultypen an eine aufrufbare Moodle-Quelle gebunden werden kann.

Das Fehlerbild ist uneinheitlich belegt: Bündel A liest `lib/classes/formatting.php:279-280` als
`coding_exception` (Fehlerbild c, wenn es beim Kursseiten-Cachebau greift), Bündel B als stillen
Rückfall auf `FORMAT_MOODLE` (a). **Die Diskrepanz ist offen** — siehe [Offene Punkte](#offene-punkte).
Beide Lesarten führen zur selben Katalogregel: prüfen.

---

# Teil II — Bündel A: `label`, `page`, `url`

## 1. mod_label

Instanztabelle `mdl_label`, 6 Spalten (`mod/label/db/install.xml:9-14`). Kurspilot setzt `name`, `intro`, `introformat` (create + update), `timemodified` (nur update, `create_label.php` überlässt es dem Modul).

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `id` | int(10), SEQUENCE | auto | `keine` | — | ja (PK) | — | ja, `$DB->insert_record` (`mod/label/lib.php:76`) |
| `course` | int(10) NOT NULL DEFAULT 0 | gültige `mdl_course.id` | `keine` (kein FK in install.xml, `mod/label/db/install.xml:16-21`) | DB 0 | faktisch ja | verwaiste Instanz, Kursindex `mod/label/index.php` zeigt sie nicht; unbelegt für harten Fehler | ja — `add_moduleinfo` setzt `$moduleinfo->course = $course->id` (`course/modlib.php:55`) |
| `name` | char(255) NOT NULL; Formular `text`, `PARAM_TEXT` bzw. `PARAM_CLEANHTML` (`mod/label/mod_form.php:42-47`) | ≤255 Zeichen; leer erlaubt (wird abgeleitet) | `aufrufbar`: `get_label_name($label)` (`mod/label/lib.php:36-59`), Länge über `LABEL_MAX_NAME_LENGTH` | DB kein Default; Formular kein Default; Modul leitet aus `intro` ab, gekürzt auf 50 Zeichen + `…` (`mod/label/lib.php:49-51`) | NOT NULL ohne Default → ja; Formular macht `required` explizit **weg** (`mod/label/mod_form.php:72-81`) | >255 Zeichen: `$DB->insert_record` gegen `char(255)` → **(e)** DB-Fehler bzw. stille Kürzung je nach DB-Strictmode (unbelegt welche Variante); leerer Name wird beim nächsten Kursseiten-Cachebau selbstheilend auf `label{id}` gesetzt (`mod/label/lib.php:157-160`) → **(a)** | **ja** — `label_add_instance` überschreibt `$label->name = get_label_name($label)` (`mod/label/lib.php:73`), ebenso `label_update_instance` (`:105`). Ein gesetzter, nicht-leerer Name überlebt (`:38-40`). |
| `intro` | text NOT NULL; Formular `editor` `introeditor`, `PARAM_RAW` (`course/moodleform_mod.php:1004-1006`) | beliebiges HTML, ungefiltert | `keine` | DB kein Default | NOT NULL ohne Default → ja | Für Label ist `intro` **die** Anzeige: es wird beim Cachebau via `format_module_intro()` gerendert (`mod/label/lib.php:164`, `lib/weblib.php:868-875`). Bösartiges HTML wird durch `clean_text()` entschärft (`lib/classes/formatting.php:234-238`) → **(a)** | nein |
| `introformat` | int(4) NULL DEFAULT 0 | 0,1,2,4 | `aufrufbar`: `format_text_menu()` (`lib/weblib.php:464-469`) | DB 0 (= `FORMAT_MOODLE`!); Formular: Editor-Format des Nutzers; Kurspilot setzt hart `FORMAT_HTML` (`create_label.php`) | nein (nullable, Default 0) | z.B. `3` oder `99` → `coding_exception` in `format_text` (`lib/classes/formatting.php:279-280`), ausgelöst beim **Kursseiten-Cachebau** über `label_get_coursemodule_info` (`mod/label/lib.php:164`) → **(c) Kursseite kaputt**, nicht nur die Aktivität | nein |
| `timemodified` | int(10) NOT NULL DEFAULT 0 | Unix-Zeit | `keine` | DB 0 | nein | Unsinnswert nur kosmetisch (Label hat keine „zuletzt geändert"-Anzeige) → **(a)** | **ja** — `label_add_instance` (`mod/label/lib.php:74`) und `label_update_instance` (`:106`) setzen `time()`. Kurspilots `update_label.php` setzt es zusätzlich selbst, was am Direkt-DB-Pfad nötig ist. |

**Nicht in der Instanztabelle, aber von Kurspilot mitgeschrieben:** `visible` in `mdl_course_modules` (0/1). Zusätzlich relevant: `showdescription`. Das Label-Formular setzt es als *hidden* fest auf `1` (`mod/label/mod_form.php:54-55`), Kurspilot setzt es gar nicht → `add_moduleinfo` schreibt `0` (`course/modlib.php:120`). Für Label ist das folgenlos, weil `label_get_coursemodule_info()` den Inhalt unabhängig von `showdescription` in `$info->content` legt (`mod/label/lib.php:164`) und `label_cm_info_view()` das Custom-Rendering aktiviert (`mod/label/lib.php:89-91`). Ein generisches Vehikel sollte `showdescription = 1` trotzdem mitschicken, um dem Formularverhalten zu entsprechen.

**1. `data_postprocessing()`** — existiert in `mod/label/mod_form.php` **nicht**; es greift die leere Basisimplementierung `moodleform_mod::data_postprocessing()` (`course/moodleform_mod.php:1168-1169`). Überschrieben ist nur `validation()` (`mod/label/mod_form.php:72-81`), und die *entfernt* lediglich einen Required-Fehler. Kein `$_POST`/`optional_param`/`file_get_submitted_draft_itemid` im Schreibpfad (`view.php:28-29` ist der Lesepfad). **Folge des `$mform = null`: keine.**

**2. Editor-/Dateifelder** — nur `intro` (Dateibereich `mod_label/intro`). Ohne Formular gibt es keine Draft-Area; Kurspilot liefert `intro` + `introformat` direkt, `add_moduleinfo` lässt das durch. Eingebettete Bilder müssten als absolute URL oder als bereits im Dateibereich liegende `@@PLUGINFILE@@`-Referenz kommen — Letzteres erfordert einen separaten Upload in `mod_label/intro/0` und ist ohne Draft-Itemid nicht über den Formularweg machbar.

**3. Ampel: GRÜN.** Vier fachliche Spalten, davon zwei vom Modul selbst nachgerechnet, kein Formular-Postprocessing, keine Editor-Sonderlogik. Einzige echte Regel: `introformat` gegen `format_text_menu()` validieren, sonst ist die Kursseite hin.

---

## 2. mod_page

Instanztabelle `mdl_page`, 12 Spalten (`mod/page/db/install.xml:9-21`). Kurspilot setzt `name`, `intro=''`, `introformat`, `content`, `contentformat`, `display=5`, `printheading=1` (**existiert nicht mehr**, s.u.), `printintro=0`, `printlastmodified=1`.

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `id` | int(10) SEQUENCE | auto | `keine` | — | ja (PK) | — | ja (`mod/page/lib.php:116`) |
| `course` | int(10) NOT NULL DEFAULT 0 | `mdl_course.id` | `keine` | DB 0 | faktisch ja | verwaist; unbelegt für harten Fehler | ja, `add_moduleinfo` (`course/modlib.php:55`) |
| `name` | char(255) NOT NULL; Formular `text`, `PARAM_TEXT`/`PARAM_CLEANHTML` (`mod/page/mod_form.php:42-47`) | 1–255 Zeichen | `keine` | kein Default | **ja** — `addRule('name', null, 'required', …)` (`mod/page/mod_form.php:48`) + NOT NULL ohne Default | leer → Aktivität ohne Titel auf Kursseite (`mod/page/lib.php:219`) → **(a)**; >255 → **(e)**/Kürzung, DB-abhängig (unbelegt) | nein |
| `intro` | text NULL; Formular `introeditor` | HTML | `keine` | DB kein Default (nullable) | nein (`$CFG->requiremodintro` schaltet `addRule` zu, `course/moodleform_mod.php:999,1007-1009`) | wird nur gerendert, wenn `printintro` oder `showdescription` gesetzt sind (`mod/page/view.php:60-65`, `mod/page/lib.php:221-224`) → sonst **(a)** | nein |
| `introformat` | int(4) NOT NULL DEFAULT 0 | 0,1,2,4 | `aufrufbar`: `format_text_menu()` (`lib/weblib.php:464-469`) | DB 0 | nein | wie Label: `coding_exception` (`lib/classes/formatting.php:279-280`). Trifft bei `showdescription=1` den Kursseiten-Cache (`mod/page/lib.php:223`) → **(c)**, sonst nur die Aktivitätsseite im Popup-Fall (`mod/page/view.php:75`) → **(b)** | nein |
| `content` | text NULL; Formular `editor` namens `page` (`mod/page/mod_form.php:54`) | HTML/Markdown je nach `contentformat` | `keine` | kein Default | **ja im Formular** (`addRule('page', …, 'required', …)`, `mod/page/mod_form.php:55`), **nein in der DB** | leer → leere Seite → **(a)** | nein — aber Achtung: `page_add_instance` liest `$data->content` nur direkt, wenn `$mform` **falsy** ist; mit Formular kommt es aus `$data->page['text']` (`mod/page/lib.php:111-114`). Kurspilots `$mform = null` trifft genau den direkten Zweig. |
| `contentformat` | int(4) NOT NULL DEFAULT 0 | 0,1,2,4 | `aufrufbar`: `format_text_menu()` | DB 0; Formular: Editorformat aus `$data->page['format']` | nein | falscher Wert → `format_text()` in `mod/page/view.php:93` → `coding_exception` → **(b) Aktivitätsseite kaputt** (Kursseite bleibt heil, weil `page_get_coursemodule_info` `content` nicht rendert, `mod/page/lib.php:213-224`) | nein |
| `display` | int(4) NOT NULL DEFAULT 0 | Modul-Admin erlaubt nur `RESOURCELIB_DISPLAY_OPEN`(5) und `RESOURCELIB_DISPLAY_POPUP`(6) (`mod/page/settings.php:31`) | `aufrufbar`: `resourcelib_get_displayoptions(explode(',', get_config('page')->displayoptions))` (`lib/resourcelib.php:111-138`, so aufgerufen in `mod/page/mod_form.php:61-63`). Zusätzlich `Konstante` (global, `define()`): `RESOURCELIB_DISPLAY_*` `lib/resourcelib.php:30-42` | DB 0; Formular `$config->display`; Admin-Default `RESOURCELIB_DISPLAY_OPEN` = 5 (`mod/page/settings.php:46-47`) | **ja im Add-Pfad** — `page_add_instance` liest `$data->display` bedingungslos (`mod/page/lib.php:103`); fehlt es, PHP-8-Warning und `null` in eine NOT-NULL-Spalte → **(e)** | Wert ≠ 6 verhält sich überall wie „normal öffnen" (`mod/page/lib.php:226-228`, `mod/page/view.php:67`) → **(a)** still ignoriert. Kurspilots `display = 5` ist korrekt und deckt sich mit dem Admin-Default. | nein |
| `displayoptions` | text NULL, serialisiertes Array | Schlüssel `printintro`, `printlastmodified`, bei `display=6` zusätzlich `popupwidth`/`popupheight` | `abgeschrieben`: die Schlüssel stehen nur inline in `mod/page/lib.php:102-109` (add) und `:151-158` (update); Leser: `mod/page/view.php:59-60,96` | wird immer neu serialisiert | nein | Kaputter Serialize-String → `unserialize_array()` liefert leeres Array → Defaults greifen → **(a)** | **ja, vollständig** — `page_add_instance` (`mod/page/lib.php:109`) und `page_update_instance` (`:158`) überschreiben `displayoptions` bei **jedem** Schreibvorgang aus `display`/`printintro`/`printlastmodified`/`popup*`. Ein Patch darf `displayoptions` über diesen Weg nie direkt setzen; er muss die Einzelfelder liefern. |
| `legacyfiles` | int(4) NOT NULL DEFAULT 0 | 0/1/2 | `Konstante` (global, `define()`): `RESOURCELIB_LEGACYFILES_NO/DONE/ACTIVE`, `lib/resourcelib.php:45-49` | DB 0 | nein | Formularfeld erscheint nur, wenn ≠ 0 (`mod/page/mod_form.php:97-102`); Fremdwert ohne Migrationsdaten → **(a)** | nein. **Nicht anfassen** — reines Altlast-Feld aus der Moodle-1.9-Migration. |
| `legacyfileslast` | int(10) NULL | Unix-Zeit | `keine` | NULL | nein | **(a)** | nein. Nicht anfassen. |
| `revision` | int(10) NOT NULL DEFAULT 0 | ≥0 | `keine` | DB 0; Formular hidden mit Default `1` (`mod/page/mod_form.php:111-113`) | nein | Wert wird als Cache-Buster in `file_rewrite_pluginfile_urls(... , $page->revision)` benutzt (`mod/page/view.php:88`); falscher Wert → Browser liefert veraltete eingebettete Bilder → **(a)** | **ja im Update-Pfad** — `page_update_instance` macht `$data->revision++` (`mod/page/lib.php:149`). Ein Patch darf `revision` beim Update nicht selbst setzen; er muss den aktuellen Wert korrekt durchreichen, sonst zählt er von null hoch. Im Add-Pfad wird nichts nachgerechnet, dort greift der DB-Default 0. |
| `timemodified` | int(10) NOT NULL DEFAULT 0 | Unix-Zeit | `keine` | DB 0 | nein | wird auf der Aktivitätsseite als „Zuletzt geändert" angezeigt, wenn `printlastmodified` nicht ausgeschaltet ist (`mod/page/view.php:96-99`) → falscher Wert = sichtbarer Unsinn → **(a)** | **ja** — `page_add_instance` (`mod/page/lib.php:101`), `page_update_instance` (`:147`) |

**Pseudo-Felder, die kein DB-Feld sind, aber `*_instance()` braucht:** `printintro` (Admin-Default 0, `mod/page/settings.php:42-43`, Formular `advcheckbox` `mod/page/mod_form.php:91-92`), `printlastmodified` (Admin-Default 1, `mod/page/settings.php:44-45`), `popupwidth`/`popupheight` (Admin-Default 620/450, `mod/page/settings.php:48-51`; nur gelesen bei `display == 6`, `mod/page/lib.php:103-106`). Ein generisches Vehikel muss `printintro` und `printlastmodified` **immer** mitliefern — sie werden unbedingt gelesen (`mod/page/lib.php:107-108`, `:156-157`), fehlend würde `null` in die serialisierten Optionen wandern.

**Kurspilot-Befund:** `create_page.php` setzt `$moduleinfo->printheading = 1`. In Moodle 5.0 gibt es kein `printheading` mehr — weder in `mod/page/db/install.xml`, noch in `mod/page/lib.php`, noch im Formular. `$DB->insert_record()` verwirft unbekannte Properties, der Wert ist also folgenlos, aber tote Fracht.

**1. `data_postprocessing()`** — in `mod/page/mod_form.php` **nicht** vorhanden; nur `data_preprocessing()` (`mod/page/mod_form.php:122-145`), und die läuft ausschließlich beim *Befüllen* des Bearbeitungsformulars, nie beim Speichern. Der einzige Direktzugriff außerhalb des `$data`-Flusses ist `file_get_submitted_draft_itemid('page')` in `mod/page/mod_form.php:124` — ebenfalls Lesepfad. **Folge des `$mform = null` im Add-Pfad: keine**, im Gegenteil: `page_add_instance` hat für genau diesen Fall den Zweig `if ($mform)` (`mod/page/lib.php:111-114,122-126`), der die Draft-Area-Übernahme überspringt und `$data->content` unverändert übernimmt. Sauber vorgesehen.

**Aber:** `page_update_instance($data, $mform)` hat diesen Schutz **nicht**. Es liest in Zeile 145 unbedingt `$data->page['itemid']` und in `:160-161` `$data->page['text']`/`['format']`. Ein generisches Vehikel, das `update_moduleinfo()` mit `$mform = null` aufruft, muss also zwingend `$moduleinfo->page = ['text' => …, 'format' => …, 'itemid' => 0]` synthetisieren. Ohne das: PHP-Warning „Undefined property `page`" plus „Trying to access array offset on null", und `content`/`contentformat` werden auf `null` gesetzt → **(b) Aktivitätsseite leer**. (Ob das zusätzlich die Webservice-Antwort zerlegt, hängt vom Debug-Level ab — unbelegt.) Genau deshalb umgeht Kurspilots `update_page.php` `update_moduleinfo()` und schreibt direkt in `mdl_page` — mit dem Nebeneffekt, dass `revision` nicht hochgezählt wird und `displayoptions` unangetastet bleibt.

**2. Editor-/Dateifelder** — zwei Dateibereiche: `mod_page/intro/0` und `mod_page/content/0`. Ohne Formular:
- `intro`: über `$moduleinfo->intro` + `introformat` direkt (Add-Pfad, `course/modlib.php:133-139`); beim Update über ein synthetisches `introeditor` mit `itemid = 0`.
- `content`: über `$data->content` + `$data->contentformat` direkt (Add-Pfad, weil `if ($mform)` greift, `mod/page/lib.php:111`); beim Update über ein synthetisches `page`-Array. Für tatsächlich eingebettete Dateien müsste man nach dem Insert selbst in `mod_page/content/0` schreiben (Optionen kommen aus `page_get_editor_options($context)`, `mod/page/locallib.php:51-54`) und `@@PLUGINFILE@@`-Platzhalter im HTML verwenden — plus `revision` erhöhen, sonst zeigt der Browser den alten Cache (`mod/page/view.php:88`).

**3. Ampel: GELB.** Der Add-Pfad ist deklarativ machbar, verlangt aber vier Pflicht-Pseudofelder (`display`, `printintro`, `printlastmodified`, `contentformat`), die kein DB-Default abfedert. Sonderbehandlung, die namentlich in die Freigabeliste gehört: (a) `page`-Array beim Update synthetisieren, (b) `displayoptions` nie direkt setzen, (c) `revision` beim Update durchreichen statt neu setzen.

---

## 3. mod_url

Instanztabelle `mdl_url`, 10 Spalten (`mod/url/db/install.xml:9-18`). Kurspilot setzt `name`, `intro`, `introformat`, `externalurl`, `display=0`, `displayoptions=serialize(['printintro'=>0])`.

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `id` | int(10) SEQUENCE | auto | `keine` | — | ja (PK) | — | ja (`mod/url/lib.php:126`) |
| `course` | int(10) NOT NULL DEFAULT 0 | `mdl_course.id` | `keine` | DB 0 | faktisch ja | verwaist; unbelegt | ja, `add_moduleinfo` (`course/modlib.php:55`) |
| `name` | char(255) NOT NULL; Formular `text`, `PARAM_TEXT`/`PARAM_CLEANHTML` (`mod/url/mod_form.php:40-46`) | 1–255 | `keine` | kein Default | **ja** — `addRule('name', null, 'required', …)` (`mod/url/mod_form.php:47`) | leer → titelloser Link auf der Kursseite (`mod/url/lib.php:221`) → **(a)**; >255 → **(e)**/Kürzung, DB-abhängig (unbelegt) | nein |
| `intro` | text NULL; Formular `introeditor`, Zeilenhöhe auf 5 gesetzt (`mod/url/mod_form.php:52-56`) | HTML | `keine` | kein Default | nein (außer `$CFG->requiremodintro`) | wird nur bei `displayoptions['printintro']` gerendert (`mod/url/locallib.php:183-191`) → sonst **(a)** | nein |
| `introformat` | int(4) NOT NULL DEFAULT 0 | 0,1,2,4 | `aufrufbar`: `format_text_menu()` (`lib/weblib.php:464-469`) | DB 0 | nein | `coding_exception` (`lib/classes/formatting.php:279-280`) über `format_module_intro` — bei `showdescription=1` im Kursseiten-Cache (`mod/url/lib.php:244`) → **(c)**, sonst auf der Aktivitätsseite (`mod/url/locallib.php:187`) → **(b)** | nein |
| `externalurl` | text NOT NULL; Formular `url`-Element, `PARAM_RAW_TRIMMED` (`mod/url/mod_form.php:49-50`) | absolute URL mit Schema, serverrelativ (`/…`) oder allgemeine URI (`mailto:`, `teamspeak:`) | `aufrufbar` zur *Prüfung*: `url_appears_valid_url($url)` (`mod/url/locallib.php:39-46`); die Fallunterscheidung darum herum ist `abgeschrieben` (`mod/url/mod_form.php:169-191`) | kein Default | **ja** — `addRule('externalurl', null, 'required', …)` (`mod/url/mod_form.php:51`) + NOT NULL ohne Default | leer oder exakt `http://` → Aktivitätsseite zeigt `notice(get_string('invalidstoredurl','url'))` und bricht ab (`mod/url/view.php:58-64`) → **(b)**. Kurspilot nutzt `PARAM_URL` in `execute_parameters` — `clean_param` macht daraus bei jeder Syntaxabweichung **stillschweigend `''`** (`lib/classes/param.php:1039-1052`), also genau dieses Fehlerbild ohne Fehlermeldung. `javascript:`-URLs sind laut Formularkommentar bewusst erlaubt (`mod/url/mod_form.php:165`). | **ja, normalisierend** — `url_fix_submitted_url()` trimmt, dekodiert HTML-Entities und stellt fehlendem Schema `http://` voran (`mod/url/locallib.php:57-71`), aufgerufen in `url_add_instance` (`mod/url/lib.php:123`) und `url_update_instance` (`:167`). Der gespeicherte Wert ist also nie identisch mit dem übergebenen. |
| `display` | int(4) NOT NULL DEFAULT 0 | Admin-seitig freigeschaltet: AUTO(0), EMBED(1), FRAME(2), NEW(3), OPEN(5), POPUP(6) — Default-Auswahl AUTO/EMBED/OPEN/POPUP (`mod/url/settings.php:31-42`) | `aufrufbar`: `resourcelib_get_displayoptions(explode(',', get_config('url')->displayoptions))` (`lib/resourcelib.php:111-138`, Aufruf `mod/url/mod_form.php:61-63`). Konstanten: global `define()`, `lib/resourcelib.php:30-42` | DB 0; Formular `$config->display`; Admin-Default `RESOURCELIB_DISPLAY_AUTO` = 0 (`mod/url/settings.php:63-64`) | **ja im `*_instance`-Pfad** — bedingungslos gelesen (`mod/url/lib.php:114,118`) | Unbekannter Wert (z.B. 99): `url_get_final_display_type()` gibt ihn unverändert zurück (`mod/url/locallib.php:341-343`), `mod/url/view.php:96-106` fällt in `default:` → `url_print_workaround()` = Zwischenseite mit Klick-Link → **(a)** still degradiert, nichts bricht. `RESOURCELIB_DISPLAY_DOWNLOAD`(4) ist admin-seitig gar nicht anwählbar, funktioniert aber. | nein |
| `displayoptions` | text NULL, serialisiertes Array | `printintro` nur bei `display ∈ {0,1,2}`; `popupwidth`/`popupheight` nur bei `display == 6` | `abgeschrieben`: die Bedingungen stehen nur inline in `mod/url/lib.php:110-121` (add) und `:153-164` (update); Leser `mod/url/lib.php:230-233`, `mod/url/locallib.php:184` | wird immer neu serialisiert | nein | Kaputter String → `unserialize_array()` → leeres Array → Popup fällt auf 620×450 zurück (`mod/url/lib.php:231-232`) → **(a)** | **ja, vollständig** — bei jedem Schreiben aus `display`/`printintro`/`popup*` neu serialisiert (`mod/url/lib.php:121`, `:164`). **Kurspilots `create_url.php` setzt `displayoptions = serialize(['printintro' => 0])` — das wird von `url_add_instance` sofort überschrieben und ist wirkungslos.** Da Kurspilot `display = 0` (AUTO) setzt, greift `mod/url/lib.php:118-120` und schreibt `printintro = (int)!empty($data->printintro)` = 0, weil die Property fehlt. Ergebnis stimmt zufällig — aus dem falschen Grund. |
| `parameters` | text NULL, serialisiertes Array | `parameter_N => variable_N`, N = 0…99 | `aufrufbar` für die Variablenseite: `url_get_variable_options($config)` (`mod/url/mod_form.php:113`); die Schleifengrenze 100 ist `abgeschrieben` (`mod/url/lib.php:101-108`) | leeres serialisiertes Array | nein | falscher Inhalt → `url_get_full_url()` hängt Unsinnsparameter an die Ziel-URL (`mod/url/locallib.php:122-140`) → **(a)** bis **(b)** je nach Ziel | **ja, zerstörerisch** — sowohl `url_add_instance` als auch `url_update_instance` bauen `parameters` aus `parameter_N`/`variable_N` neu und schreiben `serialize([])`, wenn diese fehlen (`mod/url/lib.php:101-108`, `:144-151`). Ein Update über `update_moduleinfo()` **löscht also bestehende URL-Parameter**, wenn das Vehikel sie nicht zurückspielt. Nur relevant, wenn `url/allowvariables` an ist (Default aus, `mod/url/settings.php:49-50`). |
| `timemodified` | int(10) NOT NULL DEFAULT 0 | Unix-Zeit | `keine` | DB 0 | nein | nirgends angezeigt → **(a)** | **ja** — `mod/url/lib.php:125`, `:166` |

**Pseudo-Felder:** `printintro` (Admin-Default 1, `mod/url/settings.php:61-62`; Formularfeld nur sichtbar, wenn AUTO/EMBED/FRAME freigeschaltet, `mod/url/mod_form.php:92-100`), `popupwidth`/`popupheight` (620/450, `mod/url/settings.php:65-68`). Anders als bei `page` werden `printintro` und `popup*` hier **defensiv** gelesen (`!empty()` bzw. nur im `display==6`-Zweig, `mod/url/lib.php:114-120`) — sie dürfen fehlen, außer bei `display = 6`, wo `$data->popupwidth`/`popupheight` bedingungslos gelesen werden (`mod/url/lib.php:115-116`).

**1. `data_postprocessing()`** — in `mod/url/mod_form.php` **nicht** vorhanden; nur `data_preprocessing()` (`:135-157`, Lesepfad) und `validation()` (`:159-193`). Kein `$_POST`/`optional_param`/`file_get_submitted_draft_itemid` im Schreibpfad. **Folge des `$mform = null`: die URL-Syntaxprüfung entfällt.** `validation()` ist der einzige Ort, an dem `url_appears_valid_url()` je aufgerufen wird — bei formularlosem Schreiben wird gar nicht geprüft, `url_fix_submitted_url()` präfixt einfach `http://`. Ein generisches Vehikel muss die Prüfung selbst nachbauen (Fallunterscheidung aus `mod/url/mod_form.php:169-191` + Aufruf von `url_appears_valid_url()`), sonst landen kaputte Links stumm in der DB. Kurspilots `PARAM_URL` ist strenger als Moodle selbst — es verwirft Werte, die das Formular akzeptieren würde (z.B. serverrelative `/mod/...`-Links), und zwar zu `''`, was direkt in das `invalidstoredurl`-Fehlerbild führt.

**2. Editor-/Dateifelder** — nur `intro` (`mod_url/intro/0`); dieselbe Lage wie bei Label. `mod_url` hat sonst keinen eigenen Dateibereich; `externalurl` ist reiner Text, der Filepicker im Formular (`usefilepicker => true`, `mod/url/mod_form.php:49`) füllt nur das Textfeld mit einer Repository-URL.

**3. Ampel: GELB.** Deklarativ schreibbar, aber `externalurl` ist der einzige Wert im Bündel, dessen Validierung *ausschließlich* im Formular lebt und beim formularlosen Weg ersatzlos entfällt — plus zwei Felder (`displayoptions`, `parameters`), die das Modul bei jedem Schreibvorgang aus Pseudofeldern neu erzeugt und andernfalls leert.

---

## Zusammenfassung für die Freigabeliste

| Modul | Ampel | Benannte Sonderbehandlung |
|---|---|---|
| label | grün | `introformat` gegen `format_text_menu()` prüfen; `name`/`timemodified` nicht selbst setzen (Modul rechnet nach). |
| page | gelb | Pflicht-Pseudofelder `display`, `printintro`, `printlastmodified`, `contentformat`; beim Update `page`-Array synthetisieren; `displayoptions` nie direkt setzen; `revision` durchreichen. |
| url | gelb | URL-Validierung aus `mod_form::validation()` nachbauen (`PARAM_URL` ist zu streng *und* still); `displayoptions`/`parameters` nicht direkt setzen, sondern über Pseudofelder; bei `display=6` `popupwidth`/`popupheight` mitliefern. |

Generisch, bündelübergreifend: `update_moduleinfo()` mit `$mform = null` erfordert für **jedes** Modul mit `FEATURE_MOD_INTRO` ein synthetisches `introeditor`-Array (`course/modlib.php:675-681`) — das ist kein modulspezifischer, sondern ein Kern-Stolperstein.

---


---

# Teil III — Bündel B: `resource`, `folder`, `choice`

## 1. resource (mod_resource, "Datei")

Tabelle `mdl_resource`, `mod/resource/db/install.xml:7-29`.

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `name` | char(255) NOT NULL, kein Default (`install.xml:11`); Form: `text` PARAM_TEXT/PARAM_CLEANHTML (`mod_form.php:50-55`) | 1–255 Zeichen | keine | kein DB-Default; Form: keiner | **ja** — NOT NULL ohne Default; `addRule('name', null, 'required')` `mod_form.php:56`; `maxlength 255` `mod_form.php:57` | zu lang → (e) DB-Fehler; fehlt → (e) | nein |
| `intro` | text NULL (`install.xml:12`) | beliebiges HTML | keine | NULL | nein | — | nein (aber `add_moduleinfo` überschreibt bei `introeditor`, `modlib.php:176`) |
| `introformat` | int(4) NOT NULL DEFAULT 0 (`install.xml:13`) | 0,1,2,4 | **aufrufbar**: `format_text_menu()` `lib/weblib.php:464-469`; Konstanten `FORMAT_*` `lib/weblib.php:42-65` (global) | DB 0; Kurspilot setzt FORMAT_HTML (`create_resource.php`) | nein | (a) — `lib/classes/formatting.php:279` default → FORMAT_MOODLE | nein |
| `display` | int(4) NOT NULL DEFAULT 0 (`install.xml:17`); Form: `select`/`hidden` (`mod_form.php:88-96`) | 0,1,2,3,4,5,6 — welche davon *erlaubt* sind, entscheidet die Admin-Einstellung `resource/displayoptions` | **aufrufbar (eingeschränkt)**: `resourcelib_get_displayoptions(array $enabled, $current=null)` `lib/resourcelib.php:111-138` — liefert key=>Label. Der `$enabled`-Parameter muss der Aufrufer beschaffen: `explode(',', get_config('resource')->displayoptions)`, so wie `mod_form.php:82-85`. Konstanten `RESOURCELIB_DISPLAY_*` `lib/resourcelib.php:30-42` (global). Die *möglichen* Werte für resource stehen zusätzlich **abgeschrieben** in `mod/resource/settings.php:31-38`. | DB 0; Form: `$config->display`, Admin-Default `RESOURCELIB_DISPLAY_AUTO`=0 (`settings.php:58-60`) | **de facto ja**: `resource_set_display_options($data)` liest `$data->display` ohne isset-Guard (`mod/resource/lib.php:152,156`), ebenso `resource_set_mainfile()` (`mod/resource/locallib.php:546`) → fehlt = PHP-Warning + Behandlung als 0 | (a) — `resource_get_final_display_type()` gibt jeden `!= 0` unverändert zurück (`locallib.php:498-500`); `view.php:98-108` switch fällt in `default:` → `resource_print_workaround()`; dort erneut `default:` → "click to open" (`locallib.php:234-237`). Also unbekannter Wert = verhält sich wie OPEN, keine Seite kaputt. Aber: Wert *außerhalb* der Admin-Freigabe wird von Moodle nicht geprüft — die Aktivität nutzt dann eine Darstellung, die der Admin abgeschaltet hat (unbelegt, ob das irgendwo nachträglich korrigiert wird). | nein |
| `displayoptions` | text NULL (`install.xml:18`), serialisiertes PHP-Array | Keys: `popupwidth`,`popupheight`,`printintro`,`showsize`,`showtype`,`showdate`,`filedetails` | **abgeschrieben** — Keys stehen nur inline in `resource_set_display_options()` `mod/resource/lib.php:150-169` und in den Lesestellen `locallib.php:269-280`, `locallib.php:340`, `locallib.php:400`, `locallib.php:427`, `lib.php:241-259`. Keine Funktion liefert den Key-Katalog. | DB NULL; Form baut es aus `showsize`/`showtype`/`showdate`/`printintro` (Admin-Defaults `settings.php:56-70`: printintro 1, showsize 0, showtype 1, showdate 0, popupwidth 620, popupheight 450). Kurspilot setzt hart `serialize(['printintro' => 0])`. | nein | Nicht-serialisierbarer String → `unserialize_array()` liefert leeres Array → (a) still ignoriert (`locallib.php:269`). | **teilweise ja**: `resource_set_display_options($data)` **überschreibt `$data->displayoptions` komplett** aus `showsize`/`showtype`/`showdate`/`printintro`/`popup*`, aufgerufen aus `resource_add_instance()` `lib.php:103` und `resource_update_instance()` `lib.php:132`. Ein direkt gesetztes `displayoptions` wird beim Weg über `add_moduleinfo()` also **verworfen**. Kurspilots `create_resource.php` setzt `displayoptions` und bekommt trotzdem `a:1:{s:9:"printintro";i:0;}` — nur weil `printintro` unset ist und `display=0` in der AUTO/EMBED/FRAME-Liste liegt (`lib.php:156-158`). Zufällig gleiches Ergebnis, nicht Absicht. |
| `revision` | int(10) NOT NULL DEFAULT 0 (`install.xml:20`); Form: `hidden`, Default 1 (`mod_form.php:149-151`) | beliebiger int, reiner Cache-Buster | keine | DB 0, Form 1; Kurspilot setzt 1 | nein | keins — der Wert wird beim Ausliefern per `array_shift($args)` weggeworfen (`mod/resource/lib.php:383`) | **ja beim Update**: `resource_update_instance()` `lib.php:130` (`$data->revision++`). Ein Patch darf `revision` beim Update nicht selbst setzen. Beim *Create* nicht nachgerechnet. Kurspilots `update_resource.php` inkrementiert selbst (ruft `resource_update_instance()` gar nicht auf). |
| `timemodified` | int(10) NOT NULL DEFAULT 0 (`install.xml:21`) | Unix-Timestamp | keine | 0 | nein | — | **ja**: `resource_add_instance()` `lib.php:101`, `resource_update_instance()` `lib.php:128`. Patch darf es nicht setzen. |
| `course` | int(10) NOT NULL DEFAULT 0 (`install.xml:10`) | gültige Kurs-ID | keine | 0 | ja (implizit) | falsche ID → Resource taucht in Indexlisten des falschen Kurses auf → (d) | ja: `add_moduleinfo()` setzt `$moduleinfo->course = $course->id` `modlib.php:55` |
| `filterfiles` | int(4) NOT NULL DEFAULT 0 (`install.xml:19`); Form: `select` advanced (`mod_form.php:137-140`) | 0=none, 1=allfiles, 2=htmlfilesonly | **abgeschrieben** — Array steht inline und doppelt in `mod/resource/mod_form.php:137` und `mod/resource/settings.php:71` | DB 0; Admin `resource/filterfiles` Default 0 (`settings.php:72-73`) | nein | (a) — gelesen in `mod/resource/lib.php:417` (`$filter = ...`), unbekannter Wert = kein Filter | nein |
| `tobemigrated` | int(4) NOT NULL DEFAULT 0 (`install.xml:14`) | 0/1, 1.9-Migrationsrelikt | keine | 0 | nein | 1 → `resource_get_coursemodule_info()` bricht ab (`lib.php:223-225`) und `view.php:62-65` zeigt `resource_print_tobemigrated()` → (b) Aktivitätsseite kaputt | nein |
| `legacyfiles` | int(4) NOT NULL DEFAULT 0 (`install.xml:15`) | 0,1,2 | **Konstante** (global): `RESOURCELIB_LEGACYFILES_NO/DONE/ACTIVE` `lib/resourcelib.php:45-49` | 0 | nein | 2 aktiviert on-demand-Migration aus Kursaltdateien (`lib.php:401-409`) → (a)/(b) | ja (setzt `legacyfileslast`, `lib.php:409`) |
| `legacyfileslast` | int(10) NULL (`install.xml:16`) | Timestamp | keine | NULL | nein | — | ja, `lib.php:409` |

**Vom Vehikel niemals zu setzen:** `timemodified` (immer nachgerechnet), `revision` beim Update, `displayoptions` (wird von `resource_set_display_options()` überschrieben — stattdessen `printintro`/`showsize`/`showtype`/`showdate`/`popupwidth`/`popupheight` als Pseudofelder anbieten), `tobemigrated`/`legacyfiles*` (Migrationsrelikte).

**Pseudofeld `files` (Pflicht bei create):** `resource_add_instance()` → `resource_set_mainfile($data)` (`lib.php:109`) liest `$data->files` als Draft-Item-ID (`locallib.php:541`). Ohne die Property PHP-8-Warning; Kurspilot setzt darum explizit `files = 0` (`create_resource.php`). Ein generisches Vehikel muss `files` ebenfalls immer mitliefern (0) — sonst Warning-Rauschen im Log.

### data_postprocessing()

**Existiert nicht** in `mod/resource/mod_form.php` (Datei hat nur `definition()` :33, `data_preprocessing()` :154, `definition_after_data()` :191, `validation()` :200). Die Basisimplementierung `moodleform_mod::data_postprocessing()` `course/moodleform_mod.php:1168-1169` ist leer. **Bei `$mform = null` geht also nichts verloren.**

Direktzugriff auf `$_POST`/`optional_param`: `mod_form.php:156` `file_get_submitted_draft_itemid('files')` — nur in `data_preprocessing()`, läuft ohne Formular nicht.

**Was durch das fehlende Formular wirklich fehlt:** `mod_resource_mod_form::validation()` `mod_form.php:200-230` erzwingt (a) mindestens eine Datei im Draft-Bereich (`$errors['files'] = get_string('required')`, :208) und (b) setzt bei mehreren Dateien automatisch eine Hauptdatei per `file_set_sortorder(..., 1)` (:223-227). Ohne Formular entfällt beides. Folge: eine resource ohne Datei ist erzeugbar; `view.php:69-71` landet dann in `resource_print_filenotfound()` → **(b) Aktivitätsseite kaputt**. Ein Teilausgleich steckt in `resource_set_mainfile()` `locallib.php:551-556`: bei genau *einer* Datei wird sortorder=1 gesetzt — bei mehreren nicht.

### Datei- und Editorfelder ohne Formular

- **Hauptdatei (`mod_resource`/`content`/itemid 0) ist Pflicht.** Kurspilot umgeht den Draft-Bereich komplett: `files = 0`, danach `create_file_from_string()` mit `'sortorder' => 1` direkt im Zielbereich (`create_resource.php`). Das ist der einzige saubere Weg ohne Formular, weil ein Draft-Bereich einen `sesskey` und eine User-Draft-Area voraussetzt.
- Ein generisches Vehikel braucht deshalb **zwingend** einen separaten Datei-Schritt mit explizitem `sortorder = 1` — reine Feld-Deklaration reicht für resource nicht aus.
- **`intro` mit `@@PLUGINFILE@@`**: Ohne `introeditor` läuft `file_save_draft_area_files()` in `course/modlib.php:173` nicht; eingebettete Bilder im Intro sind damit nicht möglich, Platzhalter bleiben roh stehen. Für plain HTML ohne eingebettete Dateien ist der direkte `intro`-Weg unbedenklich.

### Ampel: **gelb**

Alle Skalarfelder sind rein deklarativ und tolerant, aber der Pflicht-Dateibereich und der Sonderfall `displayoptions` (wird vom Modul aus fünf Pseudofeldern neu gebaut) brauchen benannte Sonderbehandlung.

---

## 2. folder (mod_folder, "Verzeichnis")

Tabelle `mdl_folder`, `mod/folder/db/install.xml:7-27`.

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `name` | char(255) NOT NULL, kein Default (`install.xml:11`) | 1–255 | keine | keiner | **ja** — NOT NULL ohne Default; `addRule('required')` `mod_form.php:45`, maxlength 255 `mod_form.php:46` | (e) | nein |
| `intro` | text NULL (`install.xml:12`) | HTML | keine | NULL | nein | — | nein |
| `introformat` | int(4) NOT NULL DEFAULT 0 (`install.xml:13`) | 0,1,2,4 | **aufrufbar**: `format_text_menu()` `lib/weblib.php:464-469` | DB 0; Kurspilot FORMAT_HTML | nein | (a), `lib/classes/formatting.php:279` | nein |
| `display` | int(4) NOT NULL DEFAULT 0 (`install.xml:16`); Form: `select` (`mod_form.php:52-54`) | 0 = eigene Seite, 1 = inline im Kurs | **Konstante** (global, in `mod/folder/lib.php` definiert): `FOLDER_DISPLAY_PAGE` `mod/folder/lib.php:29`, `FOLDER_DISPLAY_INLINE` `mod/folder/lib.php:31`. Das Label-Paar selbst ist **abgeschrieben** in `mod/folder/mod_form.php:53-54` — es gibt keine `folder_get_displayoptions()`. | DB 0; kein Admin-Default | nein | (a) — jede Lesestelle prüft nur `== FOLDER_DISPLAY_INLINE`: `lib.php:412`, `view.php:48`, `edit.php:59`, `renderer.php:52,63,81`. Jeder Wert ≠ 1 verhält sich wie PAGE. | nein |
| `showexpanded` | int(1) NOT NULL DEFAULT 1 (`install.xml:17`); Form: `advcheckbox` (`mod_form.php:63`) | 0/1 | keine | DB 1; Form `$config->showexpanded`; Admin `folder/showexpanded` Default 1 (`mod/folder/settings.php:30-32`) | nein | (a) — nur `!empty()` in `renderer.php:87` | **teilweise ja**: `folder_add_instance()` `lib.php:110-112` setzt es aus `get_config('folder','showexpanded')`, *wenn nicht gesetzt*. Setzt das Vehikel den Wert, gewinnt das Vehikel. |
| `showdownloadfolder` | int(1) NOT NULL DEFAULT 1 (`install.xml:18`) | 0/1 | keine | DB 1; Form `setDefault(true)` `mod_form.php:70`; kein Admin-Setting | nein | (a) — `if (!$folder->showdownloadfolder)` `lib.php:515` | nein |
| `forcedownload` | int(1) NOT NULL DEFAULT 1 (`install.xml:19`) | 0/1 | keine | DB 1; Form `setDefault(true)` `mod_form.php:75`; kein Admin-Setting | nein | (a) — `!empty()` in `renderer.php:136`, `lib.php:621`, `lib.php:749` | nein |
| `revision` | int(10) NOT NULL DEFAULT 0 (`install.xml:14`); Form: `hidden`, Default 1 (`mod_form.php:84-86`) | beliebiger int, Cache-Buster | keine | DB 0, Form 1. **Kurspilots `create_folder.php` setzt es nicht** → 0 statt der 1, die die UI erzeugen würde. | nein | keins — beim Ausliefern per `array_shift($args)` verworfen (`mod/folder/lib.php:278`) | **ja beim Update**: `folder_update_instance()` `lib.php:143` (`$data->revision++`). Kurspilots `upload_folder_file.php` inkrementiert selbst. |
| `timemodified` | int(10) NOT NULL DEFAULT 0 (`install.xml:15`) | Timestamp | keine | 0 | nein | — | **ja**: `folder_add_instance()` `lib.php:108`, `folder_update_instance()` `lib.php:141` |
| `course` | int(10) NOT NULL DEFAULT 0 (`install.xml:10`) | Kurs-ID | keine | 0 | ja implizit | (d) | ja, `modlib.php:55` |

**Vom Vehikel niemals zu setzen:** `timemodified`, `revision` beim Update.

**Pseudofeld `files` (Pflicht bei create):** `folder_add_instance()` liest `$data->files` **ohne isset-Guard** in `mod/folder/lib.php:106` (`$draftitemid = $data->files;`). Kurspilots `create_folder.php` kommentiert das explizit und setzt `files = 0`. Ein generisches Vehikel muss das übernehmen.

### data_postprocessing()

**Existiert nicht** in `mod/folder/mod_form.php` (nur `definition()` :31, `data_preprocessing()` :89, `validation()` :98). Basis leer, `course/moodleform_mod.php:1168`. Bei `$mform = null` geht nichts verloren.

**Aber ein Direktzugriff auf `$_REQUEST` liegt außerhalb des Formulars, in der lib:**
`folder_update_instance()` `mod/folder/lib.php:148`: `if ($draftitemid = file_get_submitted_draft_itemid('files'))`. Das ist kein Formularcode — es läuft auch bei `$mform = null`, direkt aus `update_moduleinfo()` (`course/modlib.php:695`). `file_get_submitted_draft_itemid()` liest `$_REQUEST[$elname]` (`lib/filelib.php:881`) und ruft bei nicht-leerem Wert **`require_sesskey()`** (`lib/filelib.php:897-899`).
→ **Harte Regel für ein generisches Vehikel:** ein Webservice-Parameter namens `files` mit einem Wert ≠ 0 lässt jeden folder-Update mit "Invalid sesskey" abstürzen. In der Praxis existiert der Parameter im WS-Request nicht → Rückgabe 0 (`filelib.php:881-883`) → Zweig übersprungen. Der Namensraum `files` ist damit für folder-Updates verbrannt.

Kurspilots `update_folder.php` umgeht das komplett: es ruft `folder_update_instance()` gar nicht auf, sondern schreibt `name`/`timemodified` per `$DB->update_record('folder', ...)` und `visible` per `set_field('course_modules', ...)`. Folge: kein `course_module_updated`-Event, kein `update_completion_date_event()` (`lib.php:152-153`).

**Was durch das fehlende Formular fehlt:** `mod_folder_mod_form::validation()` `mod_form.php:98-112` blockt die Kombination "automatische Abschlussverfolgung per Ansicht" + `display = FOLDER_DISPLAY_INLINE` (`noautocompletioninline`, :107-108). Ohne Formular ist diese kaputte Kombination erzeugbar: der Ordner hat inline keinen Link (`folder_cm_info_dynamic()` → `set_no_view_link()` `lib.php:442-446`), die View-Completion kann also nie erfüllt werden → **(a) still Unsinn**, für die Lehrkraft aber sichtbar falsch. Ein generisches Vehikel muss diese Prüfung nachbauen, wenn es `display` **und** `completionview` freigibt.

### Datei- und Editorfelder ohne Formular

- `mod_folder`/`content`/itemid 0, Unterordner über `filepath`. Kurspilot legt Verzeichnisse mit `$fs->create_directory()` an und schreibt mit `create_file_from_string()` (`upload_folder_file.php`) — kein Draft-Bereich, keine sesskey-Abhängigkeit. Das ist der Referenzweg.
- Anders als bei resource ist der Dateibereich **nicht Pflicht**: ein leerer Ordner rendert sauber.
- `intro`: gleiche Einschränkung wie bei resource (kein `@@PLUGINFILE@@`).

### Ampel: **grün** (mit einer benannten Sperre)

Alle Instanzfelder sind kleine tolerante Ints ohne Nachrechnung außer `revision`/`timemodified`; Dateien sind optional und laufen über einen separaten, formularfreien Weg. Einzige harte Sonderregel: der Parametername `files` darf beim Update nicht im Request auftauchen (`lib/filelib.php:897`).

---

## 3. choice (mod_choice, "Abstimmung")

Tabellen `mdl_choice` (`mod/choice/db/install.xml:7-35`) und `mdl_choice_options` (`install.xml:36-48`).

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `name` | char(255) NOT NULL, kein Default (`install.xml:11`) | 1–255 | keine | keiner | **ja** — NOT NULL ohne Default; `addRule('required')` `mod_form.php:24`, maxlength `mod_form.php:25` | (e) | nein |
| `intro` | **text NOT NULL, kein Default** (`install.xml:12`) | HTML | keine | keiner | **ja** — als einziges der drei Module ist `intro` NOT NULL ohne Default | fehlt → Spalte wird von `insert_record` weggelassen (`mysqli_native_moodle_database.php:1487`) → MySQL strict → **(e) DB-Fehler beim Schreiben** | nein |
| `introformat` | int(4) NOT NULL DEFAULT 0 (`install.xml:13`) | 0,1,2,4 | **aufrufbar**: `format_text_menu()` `lib/weblib.php:464-469` | DB 0; Kurspilot FORMAT_HTML | nein | (a), `formatting.php:279` | nein |
| `display` | int(4) NOT NULL DEFAULT 0 (`install.xml:16`); Form: `select` (`mod_form.php:29-32`) | 0 = horizontal, 1 = vertikal | **Konstante** (global, in `mod/choice/lib.php`): `CHOICE_DISPLAY_HORIZONTAL` `mod/choice/lib.php:42`, `CHOICE_DISPLAY_VERTICAL` `mod/choice/lib.php:43`. Das Label-Paar ist **abgeschrieben** in `mod/choice/mod_form.php:29-32`; keine Katalogfunktion. | DB 0; kein Admin-Setting | nein | (a) — `view.php:196` reicht `$choice->display` als Parameter `$vertical` an `display_options()` weiter, dort nur `if ($vertical)` (`renderer.php:34-38`). Jeder Wert ≠ 0 = vertikal. | nein |
| `publish` | int(2) NOT NULL DEFAULT 0 (`install.xml:14`); Form: `select` (`mod_form.php:107-110`) | 0 = anonym, 1 = mit Namen | **Konstante** (global): `CHOICE_PUBLISH_ANONYMOUS` `mod/choice/lib.php:34`, `CHOICE_PUBLISH_NAMES` `mod/choice/lib.php:35`. Label-Paar **abgeschrieben** in `mod_form.php:107-110`. | 0 | nein | (a), aber **datenschutzrelevant**: gelesen als `if ($choice->publish == CHOICE_PUBLISH_ANONYMOUS)` (`view.php:167,175`) und `if ($results->publish)` (`view.php:231`) — jeder Wert ≠ 0 zeigt Klarnamen der Antwortenden. Ein Tippfehler (z.B. 2) kippt von anonym auf namentlich. | nein |
| `showresults` | int(2) NOT NULL DEFAULT 0 (`install.xml:15`); Form: `select` (`mod_form.php:100-105`) | 0,1,2,3 | **Konstante** (global): `CHOICE_SHOWRESULTS_NOT/AFTER_ANSWER/AFTER_CLOSE/ALWAYS` `mod/choice/lib.php:37-40`. Label-Liste **abgeschrieben** in `mod_form.php:100-105`. | 0 | nein | (a) — `mod/choice/lib.php:945-947` prüft explizit auf die drei Konstanten; ein unbekannter Wert erfüllt keine → Ergebnisse bleiben verborgen. `view.php:161-186` fällt in `default:` (keine Info-Meldung). Kein Absturz. | nein |
| `allowupdate` | int(2) NOT NULL DEFAULT 0 (`install.xml:17`); Form: `selectyesno` | 0/1 | keine | 0 | nein | (a) — `if (... or $choice->allowupdate ...)` `view.php:157`, truthy | nein |
| `allowmultiple` | int(2) NOT NULL DEFAULT 0 (`install.xml:18`) | 0/1 | keine | 0 | nein | (a) — truthy in `renderer.php:51` | nein. **Aber**: das Formular friert das Feld ein, sobald Antworten existieren (`mod_form.php:40-45`, `$mform->freeze('allowmultiple')`). Ohne Formular fehlt diese Sperre — nachträgliches Umschalten bei vorhandenen Antworten ist über ein generisches Vehikel möglich und macht bestehende Antworten inkonsistent. |
| `showunanswered` | int(2) NOT NULL DEFAULT 0 (`install.xml:19`) | 0/1 | keine | 0 | nein | (a) | nein |
| `includeinactive` | int(2) NOT NULL DEFAULT 1 (`install.xml:20`) | 0/1 | keine | **DB-Default 1, Formular-Default 0** (`mod_form.php:117` `setDefault('includeinactive', 0)`) — die beiden fallen auseinander. Kurspilot setzt 1 (`create_choice.php`), also DB-Verhalten, nicht UI-Verhalten. | nein | (a) | nein |
| `limitanswers` | int(2) NOT NULL DEFAULT 0 (`install.xml:21`) | 0/1 | keine | 0 | nein | (a) — `$cdisplay['limitanswers']` `lib.php:199` | nein |
| `showavailable` | int(1) NOT NULL DEFAULT 0 (`install.xml:27`) | 0/1, wirkt nur bei `limitanswers=1` | keine | 0; Form `hideIf limitanswers eq 0` `mod_form.php:52` | nein | (a) — `lib.php:200` | nein |
| `timeopen` | int(10) NOT NULL DEFAULT 0 (`install.xml:22`); Form: `date_time_selector` optional | 0 = keine Grenze, sonst Unix-Timestamp | keine | 0 | nein | **(d) Wirkung über die Aktivität hinaus**: `choice_set_events($choice)` `mod/choice/locallib.php:34-90` legt/aktualisiert/löscht Zeilen in `mdl_event` → Kurskalender und Zeitleiste aller Teilnehmenden. Unsinnige Timestamps erzeugen Kalendereinträge, die nur über die Aktivität wieder wegzubekommen sind. Aufgerufen aus `choice_add_instance()` `lib.php:125` und `choice_update_instance()` `lib.php:178`. | nein (aber `choice_set_events()` schreibt daraus abgeleitete Kalendersätze) |
| `timeclose` | int(10) NOT NULL DEFAULT 0 (`install.xml:23`) | wie `timeopen` | keine | 0 | nein | wie `timeopen` → (d). **Zusätzlich**: `mod_choice_mod_form::validation()` `mod_form.php:169-179` verbietet `timeclose < timeopen` (`closebeforeopen`, :173-176). Ohne Formular ist diese Kombination erzeugbar → `view.php:153-155` setzt `$choiceopen = false`, die Abstimmung ist dauerhaft geschlossen → (b) Aktivität faktisch tot. | nein |
| `showpreview` | int(2) NOT NULL DEFAULT 0 (`install.xml:24`) | 0/1, wirkt nur bei gesetztem `timeopen` | keine | 0; Form `disabledIf timeopen[enabled]` `mod_form.php:95` | nein | (a) | nein |
| `completionsubmit` | int(1) NOT NULL DEFAULT 0 (`install.xml:26`) | 0/1 | keine | DB 0; **Form-Default 1** (`mod_form.php:188` `setDefault($completionsubmitel, 1)`) — fallen auseinander | nein | (a) | siehe `data_postprocessing()` unten |
| `timemodified` | int(10) NOT NULL DEFAULT 0 (`install.xml:25`) | Timestamp | keine | 0 | nein | — | **ja**: `choice_add_instance()` `lib.php:106`, `choice_update_instance()` `lib.php:148` |
| `course` | int(10) NOT NULL DEFAULT 0 (`install.xml:10`) | Kurs-ID | keine | 0 | ja implizit | (d) | ja, `modlib.php:55` |

**Pseudofelder für `choice_options` (kein Spaltenbezug, nur `$data`-Properties):**

| Feld | Typ | Wertebereich | Quelle | Default | Pflicht | Fehlerbild | Nachgerechnet |
|---|---|---|---|---|---|---|---|
| `option[]` | array<string>, Form `text` PARAM_CLEANHTML (`mod_form.php:55,73`) | leere Einträge = "nicht vorhanden"/"löschen" | **abgeschrieben** — Semantik steckt nur inline in `choice_add_instance()` `lib.php:110-122` und `choice_update_instance()` `lib.php:151-175`. Kein Katalog. Die 2–6-Grenze von Kurspilot ist **eine Kurspilot-Erfindung**, in Moodle gibt es sie nicht: das Formular verlangt nur `option[0]` (`mod_form.php:81-83`) und bietet initial 5 Zeilen mit 3er-Nachladen (`mod_form.php:63,77-78`). | keiner | **ja bei create** — `choice_add_instance()` `lib.php:110` macht `foreach ($choice->option ...)` ohne Guard; fehlt die Property → PHP-Warning, Abstimmung ohne Optionen → (b) | nein |
| `limit[]` | array<int>, Form `text` PARAM_INT (`mod_form.php:56,70`) | ≥ 0, 0 = unbegrenzt | keine | Form-Default 0 (`mod_form.php:67`); DB-Spalte `choice_options.maxanswers` NULL DEFAULT 0 (`install.xml:41`) | nein — `if (isset($choice->limit[$key]))` `lib.php:116`, `lib.php:156` | (a) | nein |
| `optionid[]` | array<int>, Form `hidden` PARAM_INT (`mod_form.php:57,75`) | vorhandene `choice_options.id` oder 0/unset = neu anlegen | **abgeschrieben** — `choice_update_instance()` `lib.php:160-174` | 0 | nur beim Update relevant | fremde `optionid` (aus einer anderen choice) → `update_record` schreibt die Zeile mit neuem `choiceid` um → **(d) Wirkung über die Aktivität hinaus**, die andere Abstimmung verliert eine Option (`lib.php:161-163`, kein `choiceid`-Check) | nein |

### data_postprocessing()

**Existiert** in `mod/choice/mod_form.php:151-160`. Inhalt vollständig:

```php
public function data_postprocessing($data) {
    parent::data_postprocessing($data);                 // :152 — Basis ist leer, course/moodleform_mod.php:1168-1169
    if (!empty($data->completionunlocked)) {            // :154
        $suffix = $this->get_suffix();                  // :155
        if (empty($data->{'completionsubmit' . $suffix})) {
            $data->{'completionsubmit' . $suffix} = 0;  // :157
        }
    }
}
```

**Korrektur zur Auftragsannahme: mit dem Optionen-Array hat diese Methode nichts zu tun.** Sie normalisiert ausschließlich `completionsubmit` von "nicht angehakt" (Checkbox fehlt im POST) auf die explizite 0, und nur wenn `completionunlocked` gesetzt ist. Das Optionen-Array kommt unverändert aus `repeat_elements()` (`mod_form.php:54-78`) und wird direkt in `choice_add_instance()`/`choice_update_instance()` verarbeitet — die Nachbearbeitung passiert also in der **lib**, nicht im Formular.

**Was durch `$mform = null` konkret fehlt:**
1. Die `completionsubmit`-Normalisierung. Folge: nichts Schlimmes — `completionunlocked` existiert bei einem WS-Aufruf ohnehin nicht, der Zweig wäre auch mit Formular nicht gelaufen. Das Vehikel muss `completionsubmit` aber explizit setzen (sonst DB-Default 0 statt des UI-Defaults 1, `mod_form.php:188`). Kurspilots `create_choice.php` setzt `completionsubmit = 0` — deckungsgleich mit dem DB-Default.
2. `validation()` `mod_form.php:169-179`: `timeclose < timeopen` wird nicht mehr abgefangen → siehe Fehlerbild oben.
3. `freeze('allowmultiple')` bei vorhandenen Antworten (`mod_form.php:40-45`) entfällt.
4. `addRule('option[0]', ..., 'required')` (`mod_form.php:82`) entfällt.

Direktzugriff auf `$_POST`/`optional_param`/`file_get_submitted_draft_itemid`: **keiner** — weder in `mod/choice/mod_form.php` noch in `choice_add_instance()`/`choice_update_instance()` (`mod/choice/lib.php:102-184`). choice ist damit das sauberste der drei Module.

**Baut Kurspilot die Nachbearbeitung implizit nach? Ja, und zwar korrekt.**
- `create_choice.php` liefert `option` als Liste und `limit` als `array_fill(0, count, 0)` — genau die Struktur, die `choice_add_instance()` `lib.php:110-122` erwartet. Keine Nachbearbeitung nötig, weil die Options-Verarbeitung ohnehin in der lib liegt.
- `update_choice.php` baut den Formularzustand von Hand nach: es liest die vorhandenen Optionen (`get_records('choice_options', ..., 'id ASC')`), mappt neue Texte **positionsweise auf die bestehenden `optionid`s** (IDs bleiben erhalten, Antworten bleiben zugeordnet) und hängt für überzählige Altoptionen leere Strings mit deren `optionid` an — das ist exakt der Lösch-Zweig `lib.php:164-169` (Option + zugehörige `choice_answers` werden gelöscht). Danach `choice_update_instance($choice)` direkt. Diese Rekonstruktion entspricht 1:1 dem, was `data_preprocessing()` `mod_form.php:125-141` in die Formularfelder füllt. Sauber gelöst — aber vollständig handgeschrieben und damit nicht deklarativ generierbar.

### Datei- und Editorfelder ohne Formular

- choice hat **keinen** Dateibereich außer `intro`. `mod/choice/lib.php:102-184` berührt `filelib` nicht.
- `intro` ist NOT NULL ohne Default → das Vehikel muss immer einen (ggf. leeren) String liefern. `@@PLUGINFILE@@`-Einbettungen sind ohne `introeditor` nicht möglich (`course/modlib.php:169-177`).

### Ampel: **gelb**

Die Skalarfelder sind alle deklarativ und tolerant, aber drei Punkte brauchen benannte Sonderbehandlung: `option[]`/`limit[]`/`optionid[]` sind ein Sub-Tabellen-Protokoll mit Löschsemantik und ID-Übernahme (kein Feld), `timeopen`/`timeclose` schreiben in den Kurskalender und die Reihenfolge-Validierung fehlt ohne Formular, und `publish` kippt bei jedem Wert ≠ 0 von anonym auf namentlich.

---

## Querschnitt: was ein generisches Vehikel pro Modul zusätzlich anfassen könnte

| Modul | Heute von Kurspilot gesetzt | Vom Vehikel zusätzlich erreichbar (unkritisch) | Vom Vehikel zu sperren |
|---|---|---|---|
| resource | name, intro, introformat, display, displayoptions, revision, files, visible | filterfiles, sowie die Pseudofelder printintro/showsize/showtype/showdate/popupwidth/popupheight | timemodified, revision (update), displayoptions (roh), tobemigrated, legacyfiles, legacyfileslast |
| folder | name, intro, introformat, display, showexpanded, showdownloadfolder, files, visible | forcedownload, revision (create) | timemodified, revision (update), Requestparameter `files` beim Update |
| choice | name, intro, introformat, publish, showresults, display, allowupdate, allowmultiple, showunanswered, includeinactive, limitanswers, timeopen, timeclose, showpreview, completionsubmit, showavailable, option[], limit[] (create) / +optionid[] (update), visible | — (Kurspilot deckt alle Spalten von `mdl_choice` außer `id`/`course`/`timemodified` bereits ab) | timemodified, optionid[] aus fremden Instanzen |

---


---

# Teil IV — Bündel C: `forum`, `assign`, `quiz`

## 1. forum

Instanztabelle `mdl_forum`: **29 Spalten** (`mod/forum/db/install.xml:9-37`).

Kurspilot setzt heute 25 davon (`create_forum.php:74-104`) bzw. patcht Name/Intro/Typ/Sichtbarkeit (`update_forum.php:37-41`).

### 1.1 Feldkatalog forum

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `name` | char(255) NOT NULL, kein DB-Default; Form: `text`/PARAM_TEXT | 1–255 Zeichen | `keine` (nur Formularregeln `mod/forum/mod_form.php:48,49`) | DB: keiner; Form: keiner | **ja** – NOT NULL ohne DEFAULT (`install.xml:12`), `addRule('name',...,'required')` (`mod_form.php:48`) | Fehlt ganz ⇒ (e) DB-Fehler beim `insert_record` (`lib.php:105`). >255 Zeichen ⇒ (e) bzw. Truncation je nach DB – Maxlength wird nur clientseitig geprüft (`mod_form.php:49`) | nein; bei `type='single'` wird `name` zusätzlich als Discussion-/Post-Subject gespiegelt (`lib.php:113`, `lib.php:255,264`) |
| `intro` | text NOT NULL | beliebiges HTML | `keine` | DB: keiner (NOT NULL, kein DEFAULT, `install.xml:13`) | **ja** | Fehlt ⇒ (e). Beim Update ohne `introeditor` ⇒ (a) still überschrieben, s. Konsequenz 3 | bei `type='single'` in Post-Message gespiegelt (`lib.php:116`, `lib.php:256`) |
| `introformat` | int(4) NOT NULL DEFAULT 0 | FORMAT_MOODLE 0, FORMAT_HTML 1, FORMAT_PLAIN 2, FORMAT_MARKDOWN 4 | `Konstante` (global, `lib/weblib.php`, define FORMAT_*) – **keine Funktion**, die die zulässige Menge liefert | DB: 0; Form: aus `standard_intro_elements()` (`mod_form.php:52`) | nein | Unbekannter Wert ⇒ (a) `format_text()` fällt auf Default-Formatierung zurück | nein |
| `type` | char(20) NOT NULL DEFAULT 'general'; Form: `select` | `general`, `eachuser`, `single`, `qanda`, `blog` (Formular); zusätzlich `news`, `social` nur anzeigbar, nicht wählbar | **`aufrufbar`**: `forum_get_forum_types()` `mod/forum/lib.php:5330`; Vollmenge `forum_get_forum_types_all()` `mod/forum/lib.php:5343` | DB: `general`; Form: `general` (`mod_form.php:57`) | nein | Unbekannter String wird **still gespeichert** – weder `forum_add_instance()` noch `forum_update_instance()` prüfen `type` (nur `== 'single'`, `lib.php:107`, `lib.php:210`). `mod/forum/view.php:182` schaltet per `switch` mit `case 'single'` + Default ⇒ (a) still ignoriert / verhält sich wie `general`. **Kurspilot ist hier strenger als Moodle** und lässt nur 4 Werte zu (`create_forum.php:33,60-64`) – `blog` fehlt in Kurspilots Liste | teilweise: Wechsel **auf** `single` erzeugt nachträglich die fehlende Discussion (Recovery-Pfad `lib.php:216-235`); Wechsel **weg von** `single` lässt die Discussion als Waise stehen (kein Code dagegen) |
| `duedate` | int(10) NOT NULL DEFAULT 0; Form: `date_time_selector` optional | Unix-Timestamp, 0 = keiner | `keine` | DB: 0; Form: 0 (optional-Selector) | nein | `duedate > cutoffdate` wird **ausschließlich** in `mod/forum/mod_form.php:338-342` geprüft. Bei `$mform = null` greift das **nicht** ⇒ (a) inkonsistente Termine werden gespeichert; Kalendereintrag entsteht trotzdem | ja (Kalender): `forum_update_calendar()` `mod/forum/locallib.php:721`, aufgerufen `lib.php:137` (add) und `lib.php:278` (update) |
| `cutoffdate` | int(10) NOT NULL DEFAULT 0 | Unix-Timestamp, 0 = keiner | `keine` | DB: 0; Form: 0 | nein | s. `duedate`; zusätzlich (a): Beiträge werden nach `cutoffdate` abgelehnt, auch wenn er vor `duedate` liegt | nein |
| `assessed` | int(10) NOT NULL DEFAULT 0 | 0=keine, 1=Durchschnitt, 2=Anzahl, 3=Max, 4=Min, 5=Summe | **`aufrufbar`**: `rating_manager::get_aggregate_types()` `rating/lib.php:902`; Konstanten `RATING_AGGREGATE_*` global define `rating/lib.php:28-33`. Formularfeld über `moodleform_mod` `course/moodleform_mod.php:719` | DB: 0; Form: 0 (`course/moodleform_mod.php:720`) | nein | Wert außerhalb 0–5 ⇒ (a): `rating_manager::get_aggregation_method()` (`rating/lib.php:917`) findet keinen SQL-Aggregator; Ratings werden nicht angezeigt | ja: `if (empty($forum->assessed)) $forum->assessed = 0;` (`lib.php:96-98` add, `lib.php:176-178` update); Änderung triggert `forum_update_grades()` (`lib.php:191-194,205-207`) |
| `scale` | int(10) NOT NULL DEFAULT 0 | >0 = Punkte-Maximum, <0 = negierte `scale.id`, 0 = keine Bewertung | `keine` (Wert kommt aus dem `modgrade`-Element `course/moodleform_mod.php:746`; Prüfung auf Existenz der Skala findet dort **nicht** statt) | DB: 0; Form: `$CFG->gradepointdefault` (`course/moodleform_mod.php:747`) | nein | Verweis auf nicht existierende Skala ⇒ (b) Aktivitäts-/Bewertungsanzeige bricht beim Laden der Skala. Kurspilot setzt hart 0 (`create_forum.php:88`) | Änderung triggert Neuberechnung `forum_update_grades()` (`lib.php:196-198`) |
| `assesstimestart` / `assesstimefinish` | int(10) NOT NULL DEFAULT 0 | Unix-Timestamp, 0 = unbegrenzt | `keine` | DB: 0; Form: `date_time_selector` (`course/moodleform_mod.php:754,759`), abhängig von Checkbox `ratingtime` (`:751`) | nein | **Reihenfolge start>finish wird nirgends geprüft** – nicht in `validation()`, nicht in lib.php ⇒ (a) still: `rating/lib.php:265` filtert dann alles weg, kein Beitrag ist bewertbar. | **ja, aggressiv**: `if (empty($forum->ratingtime) or empty($forum->assessed)) { assesstimestart = 0; assesstimefinish = 0; }` – `lib.php:100-103` (add) und `lib.php:182-185` (update). ⇒ Ohne zusätzliches Pseudo-Feld `ratingtime` (nicht in der DB, nur Formular-Checkbox `course/moodleform_mod.php:751`) werden beide Felder **immer auf 0 zurückgesetzt**. Für ein generisches Vehikel: diese zwei Felder sind ohne das Nicht-DB-Feld `ratingtime` faktisch nicht setzbar |
| `grade_forum` | int(10) NOT NULL DEFAULT 0 | 0 = keine Ganzforumbewertung, >0 Punkte, <0 Skala | `keine` (`modgrade`-Element `mod/forum/mod_form.php:267-272`) | DB: 0; Form: `$defaultgradingvalue` (`mod_form.php:274`) | nein | wie `scale` ⇒ (b) | Änderung triggert `forum_update_grades()` (`lib.php:200-202`); Grade-Item via `forum_grade_item_update()` `mod/forum/lib.php:805`, aufgerufen `lib.php:138`/`lib.php:279` |
| `grade_forum_notify` | int(4) NOT NULL DEFAULT 0 | 0/1 | `keine` (`selectyesno` `mod/forum/mod_form.php:304`) | DB: 0 | nein | (a) | nein. **Kurspilot setzt dieses Feld nicht** (`create_forum.php` fehlt es) ⇒ DB-Default greift |
| `maxbytes` | int(10) NOT NULL DEFAULT 0 | 0 = Kurslimit, 1 = Upload verboten, sonst Bytewert aus der Auswahlliste | `aufrufbar` (eingeschränkt): `get_max_upload_sizes($CFG->maxbytes, $COURSE->maxbytes, 0, $CFG->forum_maxbytes)` `mod/forum/mod_form.php:71`; die Sonderbedeutung `1 = uploadnotallowed` steht `abgeschrieben` in `mod/forum/mod_form.php:72` | DB: 0; **Admin**: `$CFG->forum_maxbytes` (`mod_form.php:76`) | nein | Wert oberhalb des Site-Limits ⇒ (a) still auf Site-Limit gedeckelt | nein |
| `maxattachments` | int(10) NOT NULL DEFAULT 1 | 0–10, 20, 50, 100 | `abgeschrieben`: Array inline `mod/forum/mod_form.php:78-92` | DB: 1; **Admin**: `$CFG->forum_maxattachments` (`mod_form.php:96`) | nein | Zwischenwert (z.B. 15) ⇒ (a) funktioniert trotzdem, ist nur nicht im UI wählbar | nein |
| `forcesubscribe` | int(1) NOT NULL DEFAULT 0 | 0 optional, 1 erzwungen, 2 auto (initial), 3 verboten | **`aufrufbar`**: `forum_get_subscriptionmode_options()` `mod/forum/lib.php:4870`; Einzelkonstanten `FORUM_CHOOSESUBSCRIBE`/`FORCESUBSCRIBE`/`INITIALSUBSCRIBE`/`DISALLOWSUBSCRIBE` = globale `define()` `mod/forum/lib.php:39-42` | DB: 0; **Admin**: `$CFG->forum_subscription` (`mod_form.php:107-113`) | nein | Wert >3 ⇒ (a) `mod/forum/lib.php:5454` `switch` fällt durch | **ja, mit Nebenwirkung (d)**: `forcesubscribe == FORUM_INITIALSUBSCRIBE (2)` abonniert im Update **alle potenziellen Teilnehmer** (`lib.php:271-276`) bzw. beim Anlegen über den Observer `forum_instance_created()` (`lib.php:152-159`). Das erzeugt Mails an alle Kursteilnehmer – Wirkung über den Kurs hinaus |
| `trackingtype` | int(2) NOT NULL DEFAULT 1 | 0 aus, 1 optional, 2 erzwungen (2 nur wenn `$CFG->forum_allowforcedreadtracking`) | `Konstante` (global define `FORUM_TRACKING_OFF/OPTIONAL/FORCED`, `mod/forum/lib.php:47,52,58`) – die Auswahlliste wird `abgeschrieben` inline gebaut (`mod/forum/mod_form.php:115-121`); **keine** Funktion liefert die Menge | DB: 1; **Admin**: `$CFG->forum_trackingtype` mit Downgrade 2→1 wenn Forced-Tracking aus (`mod_form.php:123-127`) | nein | `2` bei ausgeschaltetem `forum_allowforcedreadtracking` ⇒ (a) wird in `lib.php:4169-4172` wie „optional" behandelt | nein |
| `rsstype` | int(2) NOT NULL DEFAULT 0 | 0 keine, 1 Diskussionen, 2 Beiträge | `abgeschrieben` inline `mod/forum/mod_form.php:131-135` | DB: 0; **Admin**: `$CFG->forum_rsstype` (`mod_form.php:139`) | nein | (a) | nein |
| `rssarticles` | int(2) NOT NULL DEFAULT 0 | 0–20 (inline-Liste) | `abgeschrieben` inline `mod/forum/mod_form.php:143-159` | DB: 0; **Admin**: `$CFG->forum_rssarticles` (`mod_form.php:160`) | nein | (a) | nein |
| `timemodified` | int(10) NOT NULL DEFAULT 0 | Unix-Timestamp | `keine` | DB: 0 | nein | – | **ja, immer überschrieben**: `$forum->timemodified = time();` `mod/forum/lib.php:94` (add) und `mod/forum/lib.php:174` (update). Nicht setzbar |
| `warnafter` | int(10) NOT NULL DEFAULT 0 | ≥0 Beiträge | `keine` (Freitextfeld, nur `numeric`-Clientregel `mod/forum/mod_form.php:204`) | DB: 0; Form: `'0'` (`mod_form.php:203`) | nein | `warnafter > blockafter` ⇒ (a) Warnung greift nie; wird nirgends geprüft | nein |
| `blockafter` | int(10) NOT NULL DEFAULT 0 | ≥0 Beiträge | `keine` (`mod/forum/mod_form.php:195-199`) | DB: 0; Form: `'0'` (`mod_form.php:196`) | nein | (a) | nein |
| `blockperiod` | int(10) NOT NULL DEFAULT 0 | 0 oder 1–7 Tage in Sekunden | `abgeschrieben` inline `mod/forum/mod_form.php:183-190` | DB: 0 | nein | Beliebige Sekundenzahl ⇒ (a) funktioniert, ist nur nicht wählbar | nein |
| `completiondiscussions` / `completionreplies` / `completionposts` | int(9) NOT NULL DEFAULT 0 | ≥0 | `keine` | DB: 0 | nein | Wert >0 bei `completion != COMPLETION_TRACKING_AUTOMATIC` ⇒ **(a) Unsinn**: normalerweise nullt `data_postprocessing()` diese Felder (`mod/forum/mod_form.php:524-546`), das läuft hier nicht. Die Aktivität zeigt dann Abschlussbedingungen an, die nie greifen | nein – die einzige Normalisierung steckt in der nie laufenden `data_postprocessing()` |
| `displaywordcount` | int(1) NOT NULL DEFAULT 0 | 0/1 | `keine` (`selectyesno` `mod/forum/mod_form.php:98`) | DB: 0; Form: 0 (`mod_form.php:100`) | nein | (a) | nein |
| `lockdiscussionafter` | int(10) NOT NULL DEFAULT 0 | 0, 1d, 1w, 2w, 30d, 60d, 90d, 180d, 1a (in Sekunden) | `abgeschrieben` inline `mod/forum/mod_form.php:165-174` | DB: 0 | nein | (a); für `type='single'` im UI deaktiviert (`mod_form.php:178`), per API aber setzbar ⇒ (a) Unsinn | nein |
| `course` | int(10) NOT NULL DEFAULT 0 | gültige `course.id` | `keine` | DB: 0 | ja (implizit) | – | ja: `add_moduleinfo()` setzt `$moduleinfo->course = $course->id` (`course/modlib.php:55`) |

### 1.2 forum – `data_postprocessing()`

Existiert: `mod/forum/mod_form.php:524-546`. Sie nullt `completiondiscussions`, `completionreplies`, `completionposts`, wenn die zugehörige „enabled"-Checkbox nicht gesetzt oder `completion != COMPLETION_TRACKING_AUTOMATIC` ist. Sie läuft bei `$mform = null` **nicht**. Folge: die drei Completion-Zähler bleiben genau so stehen, wie das Vehikel sie liefert – widersprüchliche Kombinationen (Zähler >0 bei manueller Abschlussverfolgung) sind möglich. Kurspilot umgeht das, indem es alle drei hart auf 0 setzt (`create_forum.php:97-99`).

Zusätzlich greift `mod/forum/mod_form.php:513-517` (`get_data()`) auf `unformat_float()` für `gradepass_forum` zu – auch das läuft nicht; Kurspilot muss also einen bereits als Float normalisierten Wert liefern.

**Direkter `$_POST`-/Draft-Zugriff in der lib:** ja, zweimal, und beide sind sauber per `$mform`-Guard abgesichert:

```php
// mod/forum/lib.php:124  (add_instance)
if ($mform and $draftid = file_get_submitted_draft_itemid('introeditor')) { ... }
// mod/forum/lib.php:250  (update_instance)
if ($mform and $draftid = file_get_submitted_draft_itemid('introeditor')) { ... }
```

Bei `$mform = null` wird der Block übersprungen. **Fehlende Nachbearbeitung:** Bei `type='single'` werden eingebettete Dateien aus dem Intro **nicht** in den Datei-Bereich `mod_forum/post/<postid>` kopiert. Folge: Bilder/Anhänge in der Beschreibung eines Einzelthema-Forums erscheinen im automatisch erzeugten Erstbeitrag als tote `@@PLUGINFILE@@`-Referenzen ⇒ **(b) Aktivitätsseite kaputt** (Bild bricht). Für `general`/`qanda`/`eachuser` irrelevant.

`mod/forum/mod_form.php:349` (`definition_after_data`) ist ebenfalls tot – dort würde `news`/`social` in der Auswahl freigeschaltet; ohne Formular egal.

### 1.3 forum – über die Instanztabelle hinaus

- `mdl_forum_discussions` + `mdl_forum_posts`: für `type='single'` legt `forum_add_instance()` beides an (`lib.php:107-132`). Das ist **kein Feld**, sondern eine Nebenwirkung – ein reiner Feldkatalog beschreibt sie nicht.
- Grade-Items: zwei Stück (Rating-Item `itemnumber 0` und Whole-Forum-Grade), verwaltet über `forum_grade_item_update()` `mod/forum/lib.php:805`.
- Kalender-Events: `forum_update_calendar()` `mod/forum/locallib.php:721`.
- `mdl_forum_subscriptions`: Massenschreibvorgang bei `forcesubscribe = 2` (`lib.php:153-158`, `lib.php:272-275`).
- Nicht-DB-Formularfeld `ratingtime` – Pflicht-Begleiter für `assesstimestart`/`assesstimefinish` (s.o.).

Anzahl Einstellungen außerhalb `mdl_forum`: **0 echte Einstellungsfelder**, aber 1 Pseudo-Feld (`ratingtime`) und 4 Nebenwirkungstabellen.

### 1.4 forum – Ampel

**GELB.** 25 der 29 Spalten sind rein deklarativ und mit klaren Wertebereichen abzudecken; zwei Wertelisten sind sogar `aufrufbar` (`forum_get_forum_types()`, `forum_get_subscriptionmode_options()`). Benannte Sonderbehandlungen: (1) `assesstimestart`/`assesstimefinish` brauchen das Nicht-DB-Feld `ratingtime`, sonst werden sie stumm genullt; (2) `type='single'` verliert ohne Formular die Bilddateien im Erstbeitrag; (3) `forcesubscribe = 2` ist eine Massen-Mail-Nebenwirkung (d) und gehört nicht in eine offene Freigabeliste; (4) Terminreihenfolge `duedate ≤ cutoffdate` muss das Vehikel selbst prüfen.

---

## 2. assign

Instanztabelle `mdl_assign`: **38 Spalten** (`mod/assign/db/install.xml`, TABLE `assign`).

Kurspilot setzt heute 22 Kernspalten plus 14 Subplugin-Felder (`assign_settings::create_moduleinfo()` `Plugin/src/local_coursepilot/classes/assign_settings.php:16-59`).

### 2.1 Korrektur zur Aufgabenannahme

Die Aufgabe nannte „assign nutzt Klassenkonstanten". Das stimmt **nicht**: alle einschlägigen assign-Konstanten sind **globale `define()`** in `mod/assign/locallib.php:30-92` (34 Stück). Klassenkonstanten gibt es in assign nur in `mod/assign/classes/notification_helper.php:38-63` – die betreffen keine Instanzfelder. **Es gibt keine einzige Funktion, die die zulässige Menge eines assign-Feldes liefert.** Alle Auswahllisten werden im `mod_form.php` inline aus den Einzelkonstanten zusammengebaut. Für den Katalog heißt das: assign ist durchgehend `Konstante` oder `abgeschrieben`, **nie** `aufrufbar`.

### 2.2 Feldkatalog assign – von Kurspilot gesetzte Felder

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `name` | char(255) NOT NULL, kein Default | 1–255 | `keine` (Formularregeln `mod/assign/mod_form.php:56,57`) | keiner | **ja** | (e) `insert_record` `mod/assign/locallib.php:806` | nein |
| `intro` | text NOT NULL | HTML | `keine` | keiner | **ja** | (e); beim Update ohne `introeditor` (a)/leer – s. §0 Konsequenz 3. Kurspilot verifiziert deshalb explizit nach (`update_assign.php:85-88`) | nein |
| `introformat` | int(4) NOT NULL DEFAULT 0 | FORMAT_* | `Konstante` (global, `lib/weblib.php`) | 0 | nein | (a) | nein |
| `duedate` | int(10) NOT NULL DEFAULT 0 | Unix-TS, 0 = keiner | `keine` | DB 0; **Admin** `assign/duedate` + `assign/duedate_enabled` via `apply_admin_defaults()` (`course/moodleform_mod.php:1117-1145`) | nein | **Reihenfolgeprüfungen stehen nur in `mod/assign/mod_form.php:307-330`** (`duedate > allowsubmissionsfromdate`, `cutoffdate ≥ duedate`, `cutoffdate ≥ allowsubmissionsfromdate`, `gradingduedate ≥ duedate`, `gradingduedate ≥ allowsubmissionsfromdate`). Ich habe gegengeprüft: **außerhalb `validation()` prüft assign keine dieser Bedingungen** (`grep 'cutoffdate <|duedate <=|duedate >' mod/assign/locallib.php` liefert nur `locallib.php:1321`, `:6302`, `:7044` – alles Extension-/Query-Logik, keine Validierung). Bei `$mform = null` also **(a) still gespeicherter Unsinn**: z.B. `cutoffdate < duedate` ⇒ die Abgabe schließt vor dem Fälligkeitsdatum. Kurspilot hat das deshalb selbst nachgebaut (`assign_settings.php:186-190`) | ja: Kalender `assign::update_calendar()` (`locallib.php:829` add / `locallib.php:1621` update), Completion-Event (`locallib.php:830-833` / `:1622-1624`), Gradebook (`locallib.php:835` / `:1625`) |
| `allowsubmissionsfromdate` | int(10) NOT NULL DEFAULT 0 | Unix-TS | `keine` | DB 0; **Admin** `assign/allowsubmissionsfromdate` | nein | s. `duedate` | wie oben |
| `cutoffdate` | int(10) NOT NULL DEFAULT 0 | Unix-TS | `keine` | DB 0; **Admin** `assign/cutoffdate` | nein | s. `duedate` | wie oben |
| `gradingduedate` | int(10) NOT NULL DEFAULT 0 | Unix-TS | `keine` | DB 0; **Admin** `assign/gradingduedate` | nein | s. `duedate` | wie oben |
| `submissiondrafts` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`selectyesno` `mod/assign/mod_form.php:132`) | DB 0; **Admin** `assign/submissiondrafts` | nein | ≠0/1 ⇒ (a). Im UI eingefroren, sobald Abgaben existieren (`mod_form.php:134-136`) – **per API nicht eingefroren** ⇒ (a) Zustandswechsel bei laufender Aufgabe. Kurspilot baut das Einfrieren nach (`assign_settings::validate_frozen_core_changes()` `assign_settings.php:222-241`) | nein |
| `requiresubmissionstatement` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:139-144`) | DB 0; **Admin** `assign/requiresubmissionstatement` | nein | (a) | nein |
| `sendnotifications` / `sendlatenotifications` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:216,220`) | DB 0; **Admin** `assign/sendnotifications`, `assign/sendlatenotifications` | nein | (a); aber **(d)**: 1 löst Mails an alle Bewertenden aus | nein |
| `sendstudentnotifications` | int(2) NOT NULL DEFAULT 1 | 0/1 | `keine` (`mod_form.php:225`) | DB 1; **Admin** `assign/sendstudentnotifications` | nein | (a) | **ja, mit Fallback**: `$update->sendstudentnotifications = $adminconfig->sendstudentnotifications;` und nur `if (isset($formdata->sendstudentnotifications))` überschrieben (`locallib.php:763-766` add, `locallib.php:1557-1560` update). Ohne Feld greift die **Admin-Einstellung**, nicht der DB-Default |
| `maxattempts` | int(6) NOT NULL DEFAULT 1 | -1 (unbegrenzt) oder 1–30 | `Konstante` (global `ASSIGN_UNLIMITED_ATTEMPTS = -1`, `mod/assign/locallib.php:61`) + `abgeschrieben` Range 1–30 inline `mod/assign/mod_form.php:146-147` | DB 1; **Admin** `assign/maxattempts` | nein | 0 oder >30 ⇒ (a) still gespeichert; `locallib.php:8833-8851` interpretiert es. Kurspilot prüft selbst (`assign_settings.php:259-261`) | ja: `$update->maxattempts = $formdata->maxattempts ?? 1;` (`locallib.php:785`, `locallib.php:1581`) – Null-Coalescing, also ohne Feld → 1 |
| `attemptreopenmethod` | char(10) NOT NULL DEFAULT 'untilpass' | `none`, `manual`, `automatic`, `untilpass` | `Konstante` (global `define()` `mod/assign/locallib.php:55-58`). Die Formularauswahl bietet nur 3 davon an (`mod_form.php:152-171`, ohne `none`); **keine Funktion** liefert die Menge | DB `untilpass`; Form über `choicelist`; **Admin** `assign/attemptreopenmethod` | nein | Unbekannter String ⇒ (a): `switch` in `locallib.php:8831-8856` fällt durch, Wiedereröffnung passiert nie | ja: `?? ASSIGN_ATTEMPT_REOPEN_METHOD_UNTILPASS` (`locallib.php:786`, `locallib.php:1582`) |
| `teamsubmission` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:176`) | DB 0; **Admin** `assign/teamsubmission` | nein | (a); im UI eingefroren bei vorhandenen Abgaben (`mod_form.php:178-180`), per API nicht | nein |
| `requireallteammemberssubmit` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:191`) | DB 0; **Admin** `assign/requireallteammemberssubmit` | nein | 1 ohne `teamsubmission=1` ⇒ (a); nur `hideIf` im Formular (`mod_form.php:194`), keine Prüfung. Kurspilot prüft selbst (`assign_settings.php:198-200`) | nein |
| `teamsubmissiongroupingid` | int(10) NOT NULL DEFAULT 0 | 0 oder existierende `groupings.id` **des Kurses** | `aufrufbar`, aber kontextabhängig: `groups_get_all_groupings($courseid)` `mod/assign/mod_form.php:197`. Für einen Feldkatalog ist das kein statischer Wertebereich | DB 0; **Admin** `assign/teamsubmissiongroupingid` | nein | Fremd-Grouping ⇒ **(d) Wirkung über den Kurs hinaus**: die Gruppenzuordnung zieht Gruppen eines anderen Kurses heran. Kein Fremdschlüssel in `install.xml`. Kurspilot prüft `courseid` explizit (`assign_settings.php:201-205`) | nein |
| `blindmarking` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:232`) | DB 0; **Admin** `assign/blindmarking` | nein | `blindmarking=1` + `maxattempts>1` + `attemptreopenmethod='untilpass'` ist inkompatibel – geprüft **nur** in `mod/assign/mod_form.php:330-334` ⇒ bei `$mform = null` (a) still gespeicherte Kombination | nein |
| `markingworkflow` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:243`) | DB 0; **Admin** `assign/markingworkflow` | nein | (a) | nein |
| `markingallocation` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:247`) | DB 0; **Admin** `assign/markingallocation` | nein | – | **ja**: `if (empty($update->markingworkflow)) { $update->markingallocation = 0; }` (`locallib.php:791-794` add, `locallib.php:1587-1590` update). Wird also stumm genullt |
| `grade` | int(10) NOT NULL DEFAULT 0 | >0 Punkte, <0 negierte `scale.id`, 0 = unbewertet | `keine` (`modgrade`-Element via `standard_grading_coursemodule_elements()`); **Admin** `assign/defaultgradetype`, `assign/defaultgradescale` | DB 0 | nein | Verweis auf nicht existierende Skala ⇒ (b). Kurspilot prüft (`assign_settings.php:212-214`) | Grade-Item via `assign::update_gradebook()` `locallib.php:1381-1397` (`locallib.php:835` / `:1625`) |
| `completionsubmit` | int(2) NOT NULL DEFAULT 0 | 0/1 | `keine` (`mod_form.php:378`, Default 1) | DB 0; Form 1 | nein | 1 bei manueller Abschlussverfolgung ⇒ (a) Unsinn; assign hat **keine** `data_postprocessing()`, die das nullt | **ja, teilweise**: add: `!empty($formdata->completionsubmit)` (`locallib.php:774`); update: nur `if (!empty($formdata->completionunlocked))` (`locallib.php:1569-1571`) ⇒ **ohne `completionunlocked` wird `completionsubmit` beim Update gar nicht geschrieben** |
| `timemodified` / `timecreated` | int(10) NOT NULL DEFAULT 0 | – | `keine` | – | – | – | **ja, immer**: `locallib.php:744-745` (add), `timemodified` in update. Nicht setzbar |

### 2.3 Feldkatalog assign – die übrigen Spalten (verdichtet)

Diese 16 Spalten setzt Kurspilot **nicht**. Sie sind für ein generisches Vehikel der zusätzlich erreichbare Raum:

| Gruppe | Felder | Typ/Default | Quelle Wertebereich | Verhalten ohne Feld | Risiko |
|---|---|---|---|---|---|
| Anzeige | `alwaysshowdescription` int(2) DEF 0 | `keine` (Checkbox `mod_form.php:124`); **Admin** `assign/alwaysshowdescription` | `!empty($formdata->alwaysshowdescription)` (`locallib.php:751`, `:1545`) ⇒ fehlend = 0 | (a) |
| Anzeige | `activity` text NULL, `activityformat` int(4) DEF 0 | `keine` (Editor `mod_form.php:61-66`) | nur `if (isset($formdata->activityeditor))` (`locallib.php:752-755`, `:1546-1549`) ⇒ fehlend = unverändert | **Editorfeld mit Draft-Area** (`save_editor_draft_files()` `locallib.php:1650-1664`) – deklarativ nicht abbildbar |
| Abgabe | `nosubmissions` int(2) DEF 0 | `keine` | **komplett vom Modul errechnet**: `$update->nosubmissions = (!$this->is_any_submission_plugin_enabled()) ? 1 : 0;` mit separatem `update_record` **nach** dem Haupt-Insert (`locallib.php:841-844` add, `locallib.php:1629-1632` update) | nicht setzbar – gehört auf eine Sperrliste |
| Abgabe | `submissionattachments` int(2) DEF 0, `timelimit` int(10) DEF 0 | `keine`; `timelimit` nur sichtbar wenn `get_config('assign','enabletimelimit')` (`mod_form.php:115-122`) | beide `isset()`-geschützt (`locallib.php:756-758`, `:764-766`) | (a) |
| Bewertung | `hidegrader` int(2) DEF 0, `markinganonymous` int(2) DEF 0, `revealidentities` int(2) DEF 0 | `keine`; **Admin** `assign/hidegrader`, `assign/markinganonymous` | `hidegrader`/`markinganonymous` in **add** `isset()`-geschützt (`locallib.php:781-784`, `:795-802`), in **update** ist `markinganonymous` **ungeschützt**: `$update->markinganonymous = $formdata->markinganonymous;` (`mod/assign/locallib.php:1591`) | **Asymmetrie-Falle**: ein generisches Vehikel, das `$moduleinfo` beim Update von Grund auf baut, löst hier eine Undefined-Property-Warnung aus und schreibt `null` ⇒ **(e)** bei NOT-NULL-Spalte. Kurspilot entgeht dem nur, weil `assign_settings::snapshot()` die komplette Zeile über `get_moduleinfo_data()` einliest (`assign_settings.php:64-85`) |
| Gruppen | `preventsubmissionnotingroup` int(2) DEF 0 | `keine` (`mod_form.php:182`); **Admin** `assign/preventsubmissionnotingroup` | `isset()`-geschützt (`locallib.php:787-789`, `:1583-1585`) | (a) |
| Strafen | `gradepenalty` int(2) DEF 0 | `keine`; nur sichtbar wenn `core_grades\penalty_manager::is_penalty_enabled_for_module('assign')` (`mod_form.php:257`) | `?? 0` (`locallib.php:804`, `:1598`) | (a) |
| Housekeeping | `course`, `courseid`, `id` | – | vom Rahmen gesetzt | – |

**Admin-Defaults – Umfang:** `mod/assign/settings.php` definiert 34 `admin_setting`-Objekte; davon bilden **21** direkt Instanzspalten ab und werden über `$this->apply_admin_defaults()` (`mod/assign/mod_form.php:293`, Implementierung `course/moodleform_mod.php:1117`) als Formulardefault gesetzt: `alwaysshowdescription, submissiondrafts, requiresubmissionstatement, sendnotifications, sendlatenotifications, sendstudentnotifications, duedate, cutoffdate, gradingduedate, allowsubmissionsfromdate, teamsubmission, preventsubmissionnotingroup, requireallteammemberssubmit, teamsubmissiongroupingid, blindmarking, hidegrader, markingworkflow, markingallocation, markinganonymous, maxattempts, attemptreopenmethod`. Diese 21 Defaults **greifen bei `$mform = null` nicht** – ein Vehikel, das nichts liefert, landet auf dem DB-Default, nicht auf dem, was die Schule administriert hat. **Ausnahme:** `sendstudentnotifications` liest `add_instance()`/`update_instance()` selbst aus `get_admin_config()` (`locallib.php:763`, `:1557`).

### 2.4 assign – `data_postprocessing()`

**Existiert nicht.** `mod/assign/mod_form.php` definiert keine `data_postprocessing()`; es greift nur `moodleform_mod::data_postprocessing()` (Completion-Basis). Direkter `$_POST`-Zugriff in `mod_form.php`: `optional_param('recalculatepenalty', null, PARAM_TEXT)` in `definition_after_data()` (`mod/assign/mod_form.php:290`) – läuft ohne Formular nicht, ist aber nur eine Anzeigekorrektur.

**Kein `$mform`-Guard in der lib:** `assign_add_instance()`/`assign_update_instance()` (`mod/assign/lib.php`) reichen `$mform` nicht weiter; `assign::add_instance(stdClass $formdata, $callplugins)` (`mod/assign/locallib.php:736`) und `assign::update_instance($formdata)` (`mod/assign/locallib.php:1534`) arbeiten ausschließlich auf einem **plain `stdClass`**. Das ist die gute Nachricht für assign.

**Aber**: `save_intro_draft_files()` (`locallib.php:1640-1647`) und `save_editor_draft_files()` (`locallib.php:1650-1664`) sind `isset()`-geschützt und laufen ohne `introattachments`/`activityeditor` einfach nicht. Fehlende Nachbearbeitung: Datei-Anhänge zur Aufgabenbeschreibung (`ASSIGN_INTROATTACHMENT_FILEAREA`, `locallib.php:82`) und die „Aktivität"-Beschreibung mit Dateien werden nie geschrieben. Kurspilot löst das mit zwei eigenen Webservices (`upload_assignfile.php` schreibt direkt in den `introattachment`-Filearea, `upload_assign_intro_image.php` in den `intro`-Filearea plus `@@PLUGINFILE@@`-HTML) – also am `moduleinfo`-Weg vorbei.

### 2.5 assign – Submission-/Feedback-Plugin-Einstellungen: **laufen ohne Formular** ✅

Das ist der wichtigste Einzelbefund für assign. Die dynamischen Plugin-Felder werden **nicht** über das Formular verarbeitet, sondern über plain-`stdClass`-Property-Namen:

```php
// mod/assign/locallib.php:1359-1372
protected function update_plugin_instance(assign_plugin $plugin, stdClass $formdata) {
    if ($plugin->is_visible()) {
        $enabledname = $plugin->get_subtype() . '_' . $plugin->get_type() . '_enabled';
        if (!empty($formdata->$enabledname)) {
            $plugin->enable();
            if (!$plugin->save_settings($formdata)) { ... }
        } else {
            $plugin->disable();
        }
    }
    return true;
}
```

Aufgerufen in `locallib.php:816-828` (add) und `locallib.php:1606-1618` (update). Die `save_settings()` der mitgelieferten Plugins lesen ebenfalls nur Properties:

- `mod/assign/submission/file/locallib.php:128-139`: `assignsubmission_file_maxfiles`, `assignsubmission_file_maxsizebytes`, `assignsubmission_file_filetypes`
- `mod/assign/submission/onlinetext/locallib.php:131-145`: `assignsubmission_onlinetext_wordlimit`, `assignsubmission_onlinetext_wordlimit_enabled`
- `mod/assign/feedback/comments/locallib.php:242-245`: `assignfeedback_comments_commentinline`

`assignsubmission_comments`, `assignfeedback_editpdf`, `assignfeedback_file`, `assignfeedback_offline` haben **keine** eigene `save_settings()` – für sie zählt nur das `*_enabled`-Flag.

**Achtung – Default ist „aus":** `update_plugin_instance()` nutzt `!empty()`. Ein fehlendes `assignsubmission_onlinetext_enabled` bedeutet also nicht „unverändert", sondern **`$plugin->disable()`**. Ein generisches Vehikel, das bei einem Teil-Update nur `name` setzt, schaltet damit **alle Abgabe- und Feedback-Plugins ab** ⇒ **(b) Aktivitätsseite kaputt** (keine Abgabemöglichkeit mehr) und zusätzlich `nosubmissions = 1` (`locallib.php:1629-1631`). Genau deshalb liest Kurspilot vorher `assign_plugin_config` komplett in den Snapshot (`assign_settings.php:78-81`) und patcht nur explizit gesetzte Werte.

### 2.6 assign – über die Instanztabelle hinaus

`mdl_assign_plugin_config` (`mod/assign/db/install.xml`, Spalten `assignment, plugin, subtype, name, value`) hält **alle** Plugin-Einstellungen. Umfang bei den 7 mitgelieferten Plugins (`mod/assign/submission/{comments,file,onlinetext}`, `mod/assign/feedback/{comments,editpdf,file,offline}`):

- 7 × `enabled` (implizit über `enable()`/`disable()`)
- `assignsubmission_file`: `maxfilesubmissions`, `maxsubmissionsizebytes`, `filetypeslist` (3)
- `assignsubmission_onlinetext`: `wordlimit`, `wordlimitenabled` (2)
- `assignfeedback_comments`: `commentinline` (1)

⇒ **13 Einstellungen liegen außerhalb `mdl_assign`**, plus die 7 Enable-Flags. Kurspilot bildet davon 14 Felder ab (`assign_settings::plugin_fields()` `assign_settings.php:145-154`) und braucht dafür eine eigene Namensübersetzungstabelle in **beide** Richtungen (`plugin_config_field()` `:163-171`, `plugin_config_name()` `:173-181`) – weil die Formularnamen (`assignsubmission_file_maxfiles`) nicht den DB-Namen (`maxfilesubmissions`) entsprechen.

Weiter außerhalb der Instanztabelle:
- Grade-Item + `gradepass` + `gradecat`: `mdl_grade_items` (über `edit_module_post_actions()` `course/modlib.php:290-297` bzw. `:265-288`) – Kurspilot liest/schreibt das separat (`assign_settings.php:70-77`).
- Erweiterte Bewertung (`rubric`/`guide`): `advancedgradingmethod_submissions` → `mdl_grading_areas`, über `course/modlib.php:382,843,951`.
- Kalender: `mdl_event` über `assign::update_calendar()`.
- `mdl_assign_overrides`, `mdl_assign_user_flags` – nicht über `moduleinfo` erreichbar.

**Ein Feldkatalog über `mdl_assign` allein reicht für assign nicht.** Er deckt 38 von ~58 Einstellungen ab.

### 2.7 assign – Ampel

**GELB, am oberen Rand zu Rot.** Positiv: die Plugin-`save_settings()` laufen nachweislich ohne Formular (`locallib.php:1359`), es gibt keine `data_postprocessing()` und keinen `$_POST`-Zugriff in der lib. Negativ und namentlich zu behandeln: (1) `!empty()`-Semantik der Plugin-Enable-Flags macht jedes Teil-Update ohne vollständigen Snapshot zerstörerisch; (2) `markinganonymous` ist im Update ungeschützt (`locallib.php:1591`) ⇒ Snapshot ist Pflicht, nicht Kür; (3) alle fünf Terminreihenfolge-Regeln plus die Blindmarking/untilpass-Regel existieren nur in `validation()` und müssen nachgebaut werden; (4) 21 administrierbare Defaults greifen nicht; (5) 13+7 Einstellungen liegen in `assign_plugin_config` mit abweichenden Feldnamen; (6) `nosubmissions` ist modul-errechnet und gehört gesperrt.

---

## 3. quiz

Instanztabelle `mdl_quiz`: **43 Spalten** (`mod/quiz/db/install.xml`, TABLE `quiz`).

Kurspilot setzt beim Anlegen 40 Felder (`create_quiz.php:560-640`), beim Ändern geht es **nicht** über `update_moduleinfo()` (s. §3.5).

### 3.1 Konstanten-Inventar quiz

- **Globale `define()`**: `mod/quiz/lib.php:51-84` (11 Stück: `QUIZ_MAX_ATTEMPT_OPTION`, `QUIZ_MAX_QPP_OPTION`, `QUIZ_MAX_DECIMAL_OPTION`, `QUIZ_MAX_Q_DECIMAL_OPTION`, `QUIZ_GRADEHIGHEST`, `QUIZ_GRADEAVERAGE`, `QUIZ_ATTEMPTFIRST`, `QUIZ_ATTEMPTLAST`, `QUIZ_MAX_EVENT_LENGTH`, `QUIZ_NAVMETHOD_FREE`, `QUIZ_NAVMETHOD_SEQ`, `QUIZ_EVENT_TYPE_OPEN`, `QUIZ_EVENT_TYPE_CLOSE`) und `mod/quiz/locallib.php:57-79` (5 Stück).
- **Klassenkonstanten**: `mod/quiz/classes/question/display_options.php:40,43,46,49` – `DURING = 0x10000`, `IMMEDIATELY_AFTER = 0x01000`, `LATER_WHILE_OPEN = 0x00100`, `AFTER_CLOSE = 0x00010`.
- **`aufrufbar`** – drei Funktionen liefern echte Wertemengen: `quiz_get_grading_options()` `mod/quiz/locallib.php:916`, `quiz_get_overdue_handling_options()` `mod/quiz/locallib.php:939`, `quiz_get_navigation_options()` `mod/quiz/lib.php:1849`. Dazu kontextabhängig `question_engine::get_behaviour_options($current)` `question/engine/lib.php:397`, `mod_quiz\access_manager::get_browser_security_choices()` (`mod/quiz/mod_form.php:316`) und `quiz_get_user_image_options()` `mod/quiz/locallib.php:950`.

### 3.2 Feldkatalog quiz

| Feld | Typ | Wertebereich | Quelle des Wertebereichs | Default | Pflicht | Fehlerbild bei unerlaubtem Wert | Vom Modul nachgerechnet |
|---|---|---|---|---|---|---|---|
| `name` | char(255) NOT NULL, kein Default | 1–255 | `keine` (`mod/quiz/mod_form.php:82,83`) | keiner | **ja** | (e) `insert_record` `mod/quiz/lib.php:110` | `trim()` in `quiz_process_options()` `mod/quiz/lib.php:977-979` |
| `intro` / `introformat` | text NOT NULL / int(4) DEF 0 | HTML / FORMAT_* | `Konstante` (global) | – / 0 | intro: **ja** | (e); Update: s. §0 Konsequenz 3 | nein |
| `timeopen` / `timeclose` | int(10) NOT NULL DEF 0 | Unix-TS, 0 = kein Limit | `keine` | DB 0; **Admin** – kein `quiz/timeopen`-Setting; Form: `date_time_selector` optional (`mod_form.php:92,96`) | nein | `timeclose < timeopen` wird **ausschließlich** in `mod/quiz/mod_form.php:547-550` geprüft. Gegenprobe außerhalb: `mod/quiz/lib.php:1988` und `mod/quiz/classes/access_manager.php:465` vergleichen nur gegen `time()` bzw. Overrides – **keine Reihenfolgeprüfung**. Bei `$mform = null` ⇒ **(b) Aktivitätsseite kaputt**: `quizaccess_openclosedate` sperrt das Quiz dauerhaft, Kalender bekommt zwei widersprüchliche Events (`quiz_update_events()` `lib.php:1178-1233`) | ja: `quiz_update_events()` (`lib.php:1163`), Änderung an `timeclose` triggert `quiz_update_open_attempts()` (`lib.php:200-206`) |
| `timelimit` | int(10) NOT NULL DEF 0 | Sekunden, 0 = unbegrenzt | `keine` (`duration` `mod_form.php:100`) | DB 0; **Admin** `quiz/timelimit` | nein | (a) | Änderung triggert `quiz_update_open_attempts()` (`lib.php:200-206`) |
| `overduehandling` | char(16) NOT NULL DEF 'autoabandon' | `autosubmit`, `graceperiod`, `autoabandon` | **`aufrufbar`**: `quiz_get_overdue_handling_options()` `mod/quiz/locallib.php:939` | DB `autoabandon`; **Admin** `quiz/overduehandling`; Kurspilot setzt hart `autosubmit` (`create_quiz.php:579`) | nein | Unbekannt ⇒ (a) still, Abgabeverhalten fällt auf Default-Zweig | nein |
| `graceperiod` | int(10) NOT NULL DEF 0 | Sekunden, muss `> get_config('quiz','graceperiodmin')` sein wenn `overduehandling='graceperiod'` | `keine` für den Wert selbst; Untergrenze aus **Admin** `quiz/graceperiodmin` | DB 0; **Admin** `quiz/graceperiod` | nein | Zu klein ⇒ Prüfung **nur** `mod/quiz/mod_form.php:553-559` ⇒ bei `$mform = null` (a) still: Nachfrist kürzer als das Minimum | nein |
| `preferredbehaviour` | char(32) NOT NULL, **kein Default** | installierte `qbehaviour_*`-Plugins, z.B. `deferredfeedback`, `immediatefeedback`, `adaptive`, `interactive`, `deferredcbm`, `immediatecbm`, `manualgraded` | **`aufrufbar`**: `question_engine::get_behaviour_options($currentbehaviour)` `question/engine/lib.php:397` (`mod/quiz/mod_form.php:202`). Menge ist **installationsabhängig** – ein statischer Katalog wäre falsch | DB: **keiner**; **Admin** `quiz/preferredbehaviour` | **ja** (NOT NULL ohne DEFAULT, `install.xml`) | Fehlt ⇒ (e). Nicht installiertes Verhalten ⇒ **(b)**: die Attempt-Erzeugung findet die Behaviour-Klasse nicht | nein |
| `canredoquestions` | int(4) NOT NULL DEF 0 | 0/1 | `abgeschrieben` inline `mod/quiz/mod_form.php:206-209` | DB 0; **Admin** `quiz/canredoquestions` | nein | (a) | nein |
| `attempts` | int(6) NOT NULL DEF 0 | 0 = unbegrenzt, 1–10 | `Konstante` `QUIZ_MAX_ATTEMPT_OPTION = 10` (global, `mod/quiz/lib.php:51`) + `abgeschrieben` Schleife `mod/quiz/mod_form.php:150-154` | DB 0; **Admin** `quiz/attempts` | nein | >10 ⇒ (a) funktioniert, nur nicht wählbar | nein |
| `attemptonlast` | int(4) NOT NULL DEF 0 | 0/1 | `keine` (`selectyesno` `mod_form.php:218`) | DB 0; **Admin** `quiz/attemptonlast` | nein | (a) | nein |
| `grademethod` | int(4) NOT NULL DEF 1 | 1 höchste, 2 Durchschnitt, 3 erster, 4 letzter | **`aufrufbar`**: `quiz_get_grading_options()` `mod/quiz/locallib.php:916`; Konstanten global `mod/quiz/lib.php:61-64` | DB 1; **Admin** `quiz/grademethod` | nein | Unbekannt ⇒ (a) `quiz_get_grading_option_name()` `locallib.php:929` wirft Array-Key-Warnung; Note bleibt unberechnet | **ja**: Änderung von `grademethod` löst `recompute_all_final_grades()` + `quiz_update_grades()` aus (`mod/quiz/lib.php:195-199`) |
| `decimalpoints` | int(4) NOT NULL DEF 2 | 0–5 | `Konstante` `QUIZ_MAX_DECIMAL_OPTION = 5` (`mod/quiz/lib.php:53`), Liste `abgeschrieben` `mod_form.php:262-268` | DB 2; **Admin** `quiz/decimalpoints` | nein | (a) | nein |
| `questiondecimalpoints` | int(4) NOT NULL DEF -1 | -1 (= wie `decimalpoints`) oder 0–7 | `Konstante` `QUIZ_MAX_Q_DECIMAL_OPTION = 7` (`mod/quiz/lib.php:54`), `abgeschrieben` `mod_form.php:271-277` | DB -1; **Admin** `quiz/questiondecimalpoints` | nein | (a) | nein |
| `reviewattempt`, `reviewcorrectness`, `reviewmaxmarks`, `reviewmarks`, `reviewspecificfeedback`, `reviewgeneralfeedback`, `reviewrightanswer`, `reviewoverallfeedback` (8 Felder) | int(6) NOT NULL DEF 0 | Bitmaske aus 0x10000 \| 0x01000 \| 0x00100 \| 0x00010 | `Konstante` (**Klassen**konstanten `display_options::DURING/IMMEDIATELY_AFTER/LATER_WHILE_OPEN/AFTER_CLOSE`, `mod/quiz/classes/question/display_options.php:40-49`). **Keine Funktion liefert die Menge** | DB 0; **Admin** `quiz/review*` (8 Settings), im Formular als 32 Checkboxen (`mod_form.php:330-338`) | nein | Bit außerhalb der vier ⇒ (a) still ignoriert | **ja, zwei erzwungene Korrekturen**: `$quiz->reviewattempt \|= display_options::DURING;` und `$quiz->reviewoverallfeedback &= ~display_options::DURING;` (`mod/quiz/lib.php:1046-1047`). Der Versuch, `reviewattempt` ohne DURING zu setzen, wird stumm überschrieben |
| **Formularfelder statt DB-Felder** | `attemptduring`, `attemptimmediately`, `attemptopen`, `attemptclosed`, … (8 × 4 = **32 Boolean-Felder**) | 0/1 | `abgeschrieben`, Namensschema `$field . $whenname` in `quiz_review_option_form_to_db()` `mod/quiz/lib.php:1071-1093` | – | nein | – | **`quiz_process_options()` überschreibt die 8 DB-Bitmasken IMMER aus diesen 32 Formularfeldern** (`mod/quiz/lib.php:1038-1045`). ⇒ **Ein direkt gesetztes `$moduleinfo->reviewmarks = 0x10000` wird beim Speichern durch `quiz_review_option_form_to_db()` auf 0 zurückgesetzt, wenn `marksduring`/`marksimmediately`/… fehlen.** Genau deshalb baut Kurspilot die Felder in Formularschreibweise auf (`create_quiz.php:320-327`, `$moduleinfo->{$field . $when}`) |
| `questionsperpage` | int(10) NOT NULL DEF 0 | 0 = alle auf einer Seite, 1–50 | `Konstante` `QUIZ_MAX_QPP_OPTION = 50` (`mod/quiz/lib.php:52`) | DB 0; **Admin** `quiz/questionsperpage` (`mod_form.php:172`) | nein | (a) | Beim Update mit `repaginatenow` wird neu paginiert (`mod/quiz/lib.php:208-211`) – Feld `repaginatenow` ist kein DB-Feld |
| `navmethod` | char(16) NOT NULL DEF 'free' | `free`, `sequential` | **`aufrufbar`**: `quiz_get_navigation_options()` `mod/quiz/lib.php:1849`; Konstanten global `mod/quiz/lib.php:76-77` | DB `free`; **Admin** `quiz/navmethod` | nein | Unbekannt ⇒ (a) fällt auf freie Navigation zurück | nein |
| `shuffleanswers` | int(4) NOT NULL DEF 0 | 0/1 | `keine` (`selectyesno` `mod_form.php:193`) | DB 0; **Admin** `quiz/shuffleanswers` | nein | (a) | nein |
| `sumgrades` | number(10,5) NOT NULL DEF 0 | ≥0, Summe der `quiz_slots.maxmark` | `keine` | DB 0 | nein | Falscher Wert ⇒ **(b)**: alle Attempt-Noten werden falsch skaliert | **ja im Update**: `$quiz->sumgrades = $oldquiz->sumgrades;` (`mod/quiz/lib.php:145`) – der übergebene Wert wird **verworfen**. Im Add wird der übergebene Wert (i.d.R. 0) genommen und später durch `quiz_slots`-Operationen fortgeschrieben |
| `grade` | number(10,5) NOT NULL DEF 0 | ≥0 | `keine`; im Formular `hidden` (`mod_form.php:143-148`) | DB 0; **Admin** `quiz/maximumgrade` (`mod_form.php:145,388`) | nein | (a) | **ja im Update**: `$quiz->grade = $oldquiz->grade;` (`mod/quiz/lib.php:146`) ⇒ **Die Maximalnote eines Quiz lässt sich über `update_moduleinfo()` überhaupt nicht ändern.** Deshalb schreibt Kurspilot beim Update direkt in die Tabelle (§3.5) |
| `password` | char(255) NOT NULL, kein Default | beliebig, '' = keins | `keine` | DB: keiner; **Admin** `quiz/quizpassword` | **ja** (NOT NULL ohne DEFAULT) | – | **ja, mit Fallstrick**: `quiz_process_options()` macht `$quiz->password = $quiz->quizpassword; unset($quiz->quizpassword);` (`mod/quiz/lib.php:983-984`) **ohne `isset()`-Guard**. Fehlt `quizpassword`, gibt es eine Undefined-Property-Warnung und `password = null` ⇒ **(e) DB-Fehler beim Schreiben**. `password` selbst zu setzen hilft nicht – es wird überschrieben. Kurspilot setzt beide (`create_quiz.php:623-624`) |
| `subnet` | char(255) NOT NULL, kein Default | Subnetz-Liste oder '' | `keine` (`text` `mod_form.php:294`) | DB: keiner; **Admin** `quiz/subnet` | **ja** | Fehlt ⇒ (e) | nein |
| `browsersecurity` | char(32) NOT NULL, kein Default | `-` (keine), `securewindow`, ggf. `safebrowser`/`seb` je nach aktivierten Access-Regeln | **`aufrufbar`, aber installationsabhängig**: `access_manager::get_browser_security_choices()` (`mod/quiz/mod_form.php:316`) | DB: keiner; **Admin** `quiz/browsersecurity`; Kurspilot setzt `'-'` (`create_quiz.php:626`) | **ja** | Fehlt ⇒ (e). Unbekannter Wert ⇒ (a) | nein |
| `delay1` / `delay2` | int(10) NOT NULL DEF 0 | Sekunden | `keine` (`duration` `mod_form.php:299,306`) | DB 0; **Admin** `quiz/delay1`, `quiz/delay2` | nein | (a) | nein |
| `showuserpicture` | int(4) NOT NULL DEF 0 | 0 keins, 1 klein, 2 groß | **`aufrufbar`**: `quiz_get_user_image_options()` `mod/quiz/locallib.php:950`; Konstanten global `QUIZ_SHOWIMAGE_NONE/SMALL/LARGE` `mod/quiz/locallib.php:69,74,79` | DB 0; **Admin** `quiz/showuserpicture` | nein | (a) | nein |
| `showblocks` | int(4) NOT NULL DEF 0 | 0/1 | `keine` (`selectyesno` `mod_form.php:282`) | DB 0; **Admin** `quiz/showblocks` | nein | (a) | nein |
| `completionattemptsexhausted` | int(1) NULL DEF 0 | 0/1 | `keine` | DB 0 | nein | 1 ohne `completionpassgrade` ⇒ (a) | **ja**: `if (empty($quiz->completionpassgrade)) $quiz->completionattemptsexhausted = 0;` – aber **nur** `if (!empty($quiz->completionunlocked))` (`mod/quiz/lib.php:1055-1065`) |
| `completionminattempts` | int(10) NOT NULL DEF 0 | 0..`attempts` | `keine` | DB 0 | nein | `> attempts` wird **nur** in `mod/quiz/mod_form.php:562-568` geprüft ⇒ (a) unerfüllbare Abschlussbedingung | **ja, bedingt**: genullt wenn `completionminattemptsenabled` leer – nur unter `completionunlocked` (`lib.php:1064-1066`). `data_postprocessing()` (`mod_form.php:531-542`) täte dasselbe, läuft aber nicht |
| `allowofflineattempts` | int(1) NULL DEF 0 | 0/1 | `keine`; Feld kommt aus der **Access-Regel** `mod/quiz/accessrule/offlineattempts/rule.php:102-105`, nicht aus `mod_form.php` | DB 0; Form 0 (`rule.php:105`) | nein | 1 zusammen mit `timelimit != 0`, `subnet != ''` oder `navmethod = 'sequential'` ist unzulässig – geprüft **nur** in `rule.php:123ff` (Formularvalidierung) ⇒ (a) | nein |
| `precreateattempts` | int(1) NULL, kein Default | 0/1 | `abgeschrieben` inline `mod/quiz/mod_form.php:123-126`; Feld existiert **nur**, wenn `get_config('quiz','precreateperiod')` gesetzt ist (`mod_form.php:121`) | DB: keiner (nullable); **Admin** `quiz/precreateattempts`, `quiz/precreateperiod` | nein | (a) | nein |
| `timecreated` / `timemodified` | int(10) NOT NULL DEF 0 | – | `keine` | 0 | – | – | **ja**: `timecreated` `mod/quiz/lib.php:102`, `timemodified` `mod/quiz/lib.php:973` |
| `course` | int(10) NOT NULL DEF 0 | – | – | 0 | ja | – | ja (Rahmen) |

### 3.3 quiz – `data_postprocessing()`

Existiert: `mod/quiz/mod_form.php:531-542`. Sie nullt `completionminattempts`, wenn `completionminattemptsenabled` nicht gesetzt oder die Abschlussverfolgung nicht automatisch ist. Läuft bei `$mform = null` **nicht**. Die Wirkung wird jedoch **teilweise von `quiz_process_options()` dupliziert** (`mod/quiz/lib.php:1055-1066`) – allerdings nur unter der Bedingung `!empty($quiz->completionunlocked)`. Fehlt dieses Nicht-DB-Feld, greift auch die Duplikat-Normalisierung nicht ⇒ (a).

Direkter `$_POST`-Zugriff: `mod/quiz/mod_form.php` nutzt keinen `optional_param()`/`file_get_submitted_draft_itemid()` in `data_postprocessing()`. Aber: `quiz_after_add_or_update()` ruft `file_save_draft_area_files((int)$quiz->feedbacktext[$i]['itemid'], ...)` (`mod/quiz/lib.php:1151-1154`) – das braucht eine echte Draft-Itemid. Kurspilot umgeht das komplett (s. §3.4).

`quiz_add_instance()`/`quiz_update_instance()` bekommen `$mform` zwar durchgereicht, nutzen es aber nicht – die Signatur dokumentiert das ausdrücklich: „`@param stdClass $mform no longer used.`" (`mod/quiz/lib.php:129`). Das ist der einzige der drei Module, der `$mform` explizit für obsolet erklärt.

### 3.4 quiz – Gesamtfeedback: die stille Löschfalle

`quiz_after_add_or_update()` löscht **immer zuerst** alle Feedback-Zeilen und legt sie aus `$quiz->feedbacktext[]` / `$quiz->feedbackboundaries[]` neu an:

```php
// mod/quiz/lib.php:1140-1157
$DB->delete_records('quiz_feedback', ['quizid' => $quiz->id]);
for ($i = 0; $i <= $quiz->feedbackboundarycount; $i++) { ... }
```

`feedbackboundarycount` kommt aus `quiz_process_options()`: ist `$quiz->feedbacktext` nicht gesetzt, wird `$quiz->feedbackboundarycount = -1;` (`mod/quiz/lib.php:1040-1041`), die Schleife läuft null Mal. ⇒ **Jedes `update_moduleinfo()` auf ein Quiz ohne `feedbacktext`-Array löscht das komplette Gesamtfeedback ersatzlos** – (a) still, und für die Lehrkraft nicht nachvollziehbar. Kurspilot schreibt `mdl_quiz_feedback` deshalb selbst (`create_quiz::save_overall_feedback()`, aufgerufen `create_quiz.php:643` und `quiz_settings.php:187-189`).

### 3.5 quiz – Kurspilot geht beim Update ganz an `update_moduleinfo()` vorbei

`update_quiz_settings` ruft **nicht** `update_moduleinfo()`, sondern schreibt direkt:

```php
// Plugin/src/local_coursepilot/classes/quiz_settings.php:143-190
$DB->update_record('quiz', $quiz);
$DB->update_record('grade_items', $gradeitem);           // gradepass
$DB->set_field('course_modules', 'visible', ...);
$DB->set_field('course_modules', 'completion', ...);
```

Das ist eine bewusste Umgehung (nur so lässt sich `grade` ändern, s. §3.2). Der Preis: **kein `quiz_update_events()`** (Kalendereinträge veralten bei `timeopen`/`timeclose`-Änderung), **kein `quiz_grade_item_update()`**, **kein `quiz_delete_previews()`**, **kein `quiz_update_open_attempts()`** bei `timelimit`-Änderung, **kein `access_manager::save_settings()`**, **kein `course_module_updated`-Event**. Für ein generisches Vehikel ist das kein gangbarer Weg – es müsste diese sechs Nachrechnungen entweder alle selbst anstoßen oder auf `update_moduleinfo()` bleiben und `grade` als nicht änderbar markieren.

### 3.6 quiz – über die Instanztabelle hinaus

| Tabelle | Inhalt | Wird von `add_moduleinfo()` bedient? |
|---|---|---|
| `mdl_quiz_sections` | Abschnitte, `heading`, `shufflequestions` (5 Spalten) | Nur die erste Zeile, hart verdrahtet: `firstslot=1, heading='', shufflequestions=0` (`mod/quiz/lib.php:112-113`). Weitere Abschnitte: **nein** |
| `mdl_quiz_slots` | Fragenreihenfolge: `slot`, `page`, `displaynumber`, `requireprevious`, `maxmark`, `quizgradeitemid` (7 Spalten je Frage) | **nein** – Kurspilot braucht dafür einen eigenen Webservice `add_questions_to_quiz` (`add_questions_to_quiz.php`), der über `mdl_question_references` (`component='mod_quiz'`, `area='slot'`, `add_questions_to_quiz.php:99-103`) arbeitet |
| `mdl_quiz_feedback` | Gesamtfeedback: `mingrade`, `maxgrade`, `feedbacktext`, `feedbacktextformat` | ja, aber destruktiv (§3.4) |
| `mdl_quiz_grade_items` | Mehrere Bewertungselemente je Quiz (Moodle 4.4+) | **nein** |
| `mdl_quiz_grades` | Errechnete Endnoten je Nutzer | errechnet, nie deklarativ |
| `mdl_quiz_overrides` | Nutzer-/Gruppenausnahmen | **nein** |
| `mdl_quizaccess_seb_quizsettings` | ~20 Safe-Exam-Browser-Einstellungen (`mod/quiz/accessrule/seb/db/install.xml`) | über `access_manager::save_settings()` (`mod/quiz/lib.php:1160`, Implementierung `mod/quiz/classes/access_manager.php:164-169`) – ist die SEB-Regel aktiv, laufen deren `save_settings()` mit; ohne die passenden `seb_*`-Properties (**nur** `mod/quiz/accessrule/seb/rule.php:160`) mit unklarem Ergebnis |
| `mdl_grade_items` | `gradepass`, `gradecat` | über `edit_module_post_actions()` `course/modlib.php:290-297` |

⇒ Selbst ein perfekter 43-Feld-Katalog für `mdl_quiz` erzeugt ein **leeres Quiz ohne Fragen**. Die eigentliche Substanz eines Quiz (`quiz_slots` + `question_references`) liegt vollständig außerhalb und ist nicht deklarativ.

### 3.7 quiz – Ampel

**ROT.** Vier voneinander unabhängige Gründe, die je für sich schon eine Sonderbehandlung nötig machen und zusammen den deklarativen Ansatz sprengen:

1. **Feldnamen ≠ Spaltennamen.** 8 DB-Bitmasken werden aus 32 Formular-Booleans errechnet (`quiz_review_option_form_to_db()` `mod/quiz/lib.php:1071`), `password` aus `quizpassword` (`lib.php:983`). Ein Katalog über `get_columns()` beschreibt hier die falschen Felder.
2. **`quizpassword` ist ungeschützte Pflicht**: fehlt es, gibt es einen DB-Fehler (e) auf einer Spalte, die im Katalog `password` heißt.
3. **Stille Datenvernichtung**: jedes Update ohne `feedbacktext` löscht `mdl_quiz_feedback` komplett (`lib.php:1140`).
4. **`grade`/`sumgrades` sind über `update_moduleinfo()` nicht änderbar** (`lib.php:145-146`) – wer sie ändern will, muss (wie Kurspilot) den ganzen Moodle-Weg umgehen und verliert damit sechs Nachrechnungen.

Dazu kommt: die Kernsubstanz (`quiz_slots`) ist gar kein Instanzfeld, `preferredbehaviour` und `browsersecurity` haben installationsabhängige Wertemengen, und `timeopen ≤ timeclose` wird nirgends außerhalb von `validation()` geprüft.

---

## 4. Querschnitt: Antwort auf die Leitfrage „reicht ein Feldkatalog?"

| | forum | assign | quiz |
|---|---|---|---|
| Spalten in der Instanztabelle | 29 | 38 | 43 |
| davon vom Modul selbst überschrieben (nicht setzbar) | 3 (`timemodified`, `assesstimestart`, `assesstimefinish`) | 4 (`timecreated`, `timemodified`, `nosubmissions`, `markingallocation` bedingt) | 12 (`timecreated`, `timemodified`, `password`, `sumgrades`, `grade` im Update, 8 `review*`) |
| Einstellungen **außerhalb** der Instanztabelle | 0 (+1 Pseudo-Feld `ratingtime`) | **20** (13 Werte + 7 Enable-Flags in `assign_plugin_config`) + Grade-Item + Grading-Method | **unbegrenzt** (`quiz_slots` je Frage) + `quiz_sections` + `quiz_feedback` + `quiz_grade_items` + SEB |
| Werteliste `aufrufbar` | 2 von 8 Auswahlfeldern | **0** | 5, davon 2 installationsabhängig |
| administrierbare Defaults, die ohne Formular verloren gehen | 6 | **21** | **~30** (22 + 8 `review*`) |
| Reihenfolge-/Kombinationsregeln nur in `validation()` | 1 (`duedate ≤ cutoffdate`) | **6** | **3** |
| Ampel | **gelb** | **gelb** (oberer Rand) | **rot** |

Ein reiner Feldkatalog trägt für **forum** fast vollständig und für **assign** unter Auflagen. Für **quiz** beschreibt er die falsche Ebene: die relevanten Eingaben heißen anders als die Spalten, und der eigentliche Inhalt liegt in Nebentabellen.

---


---

# Teil V — Konsequenzen für den Katalog und die Spec

## 1. Wie viel Katalog lässt sich an Moodle binden?

#349 hat verlangt, dass der Katalog Moodle-Quellen **referenziert statt abschreibt**. Die Zählung über
alle neun Modultypen:

| Quelle des Wertebereichs | Anzahl Auswahlfelder | Wo |
|---|---|---|
| `aufrufbar` | **12** | `format_text_menu()` (alle neun Modultypen, `introformat`/`contentformat`); `resourcelib_get_displayoptions()` (page, url, resource — braucht die Admin-Freigabe als Parameter); `forum_get_forum_types()`, `forum_get_subscriptionmode_options()`, `rating_manager::get_aggregate_types()` (forum); `quiz_get_grading_options()`, `quiz_get_overdue_handling_options()`, `quiz_get_navigation_options()`, `quiz_get_user_image_options()`, `question_engine::get_behaviour_options()`, `access_manager::get_browser_security_choices()` (quiz) |
| `Konstante` | ~20 | `RESOURCELIB_DISPLAY_*` (global), `CHOICE_*`, `FOLDER_DISPLAY_*`, `FORUM_*` (global `define()`), `display_options::*` (Klassenkonstanten, quiz), 34 globale `define()` in `mod/assign/locallib.php:30-92` |
| `abgeschrieben` | ~25 | alle Auswahllisten, die nur inline im jeweiligen `mod_form.php` stehen |
| `keine` | Rest | freie Ints, Zeitstempel, Textfelder |

**Ernüchternd:** außer `format_text_menu()` gibt es keine einzige Quelle, die über mehr als einen
Modultyp trägt. Der Wertebereich einer Konstante ist zudem **nicht** dasselbe wie eine aufrufbare
Menge: `CHOICE_SHOWRESULTS_*` nennt vier Einzelwerte, aber keine Funktion liefert „die zulässige
Menge für `showresults`". Für `assign` gilt das durchgängig — **null aufrufbare Wertemengen bei
34 Konstanten**.

Damit ist die Frage aus dem Kartenpunkt *„Pflege des Feldkatalogs über Moodle-Versionen hinweg"*
beantwortbar: **der Katalog ist überwiegend abgeschrieben und veraltet deshalb still.** Referenzieren
funktioniert für Textformate und für zehn Einzelfelder; alles andere ist eine Kopie, die bei einem
Moodle-Upgrade nachgeführt werden muss.

## 2. Was der Katalog neben Feldern tragen muss

Der Feldkatalog aus #349 trägt laut Beschluss Typ, Wertebereich, Default und deutsche Bedeutung. Die
Recherche zeigt vier weitere Kategorien, ohne die er nicht funktioniert:

1. **Pseudofelder** — Nicht-DB-Felder, die die `*_instance()`-Funktionen ungeschützt lesen und ohne die
   ein Schreibvorgang scheitert oder still Falsches tut. Belegte Fälle: `files` (resource, folder),
   `display`/`printintro`/`printlastmodified` (page), `popupwidth`/`popupheight` (url bei `display=6`),
   `page`-Array (page beim Update), `ratingtime` (forum), `quizpassword` (quiz), `feedbacktext[]`
   (quiz), 32 `review*`-Booleans (quiz), 20 `assignsubmission_*`/`assignfeedback_*`-Felder (assign).
2. **Sperrliste** — Felder, die das Modul selbst nachrechnet und die ein Patch nicht setzen darf.
   Durchgängig: `timemodified`, `timecreated`, `course`. Modulweise: `revision` beim Update (page,
   resource, folder), `name` (label), `displayoptions` und `parameters` (page, url, resource),
   `assesstimestart`/`assesstimefinish` (forum), `nosubmissions` (assign), `grade`/`sumgrades`/
   `password`/die acht `review*`-Bitmasken (quiz).
3. **Kombinationsregeln** — die elf Bedingungen, die nur in `validation()` stehen. Sie sind keine
   Feldeigenschaft, sondern eine Beziehung zwischen Feldern, und passen nicht in eine Feldzeile.
4. **Nebenwirkungsvermerk** — Felder, deren Wirkung über die Aktivität hinausreicht: Kalendereinträge
   (choice, forum, assign, quiz), Massen-Abonnements und damit Mails an alle Kursteilnehmenden
   (`forum.forcesubscribe = 2`), Bewertungsbenachrichtigungen (assign), der Wechsel von anonym auf
   namentlich (`choice.publish`), und die Löschung der Vervollständigungsdaten
   (`completionunlocked`, Teil I §2.1).

## 3. Was das für die Abdeckung bedeutet

#349 hat festgehalten: *„Der Katalog ist zugleich die Grenze: ein Modultyp ist unterstützt, wenn sein
Katalog geprüft ist."* Nach dieser Recherche:

- **Acht der neun Modultypen sind erreichbar** — zwei grün, sechs gelb. Gelb heißt nicht „später",
  sondern „mit benannter Sonderbehandlung, die in die Spec gehört".
- **`quiz` fällt als Vehikel-Kandidat heraus.** Nicht, weil es zu groß wäre, sondern weil der
  Formularweg dort die falsche Ebene ist: Feldnamen decken sich nicht mit Spaltennamen, `grade` ist
  über ihn gar nicht änderbar, und die Substanz eines Tests liegt in `quiz_slots`. Kurspilots
  heutige Sonderbehandlung (`quiz_settings.php`, direkter DB-Weg) bleibt notwendig — sie ist damit
  keine Altlast, sondern eine begründete Ausnahme. Das ändert die Bauform nicht, wohl aber die
  Werkzeugzahl: `update_quiz_settings` bleibt ein Einzelwerkzeug.
- Für die **Ersetzungsschwelle** (#351) heißt das: das Vehikel deckt acht Modultypen ab, nicht neun.

## 4. Fehlerbilder — die Bandbreite

Die in #355 gesuchte Bandbreite, belegt über alle neun Modultypen:

| Bild | Häufigkeit | Bezeichnende Fälle |
|---|---|---|
| **(a) still ignoriert / stiller Unsinn** | **weit überwiegend** | fast alle Auswahlfelder fallen bei unbekanntem Wert in einen `default:`-Zweig; dazu die rechteabhängigen und kursweiten Auslassungen (Teil I §3, §4) |
| **(b) Aktivitätsseite kaputt** | selten | `resource` ohne Hauptdatei (`mod/resource/view.php:69-71`), `url` mit leerem `externalurl` (`mod/url/view.php:58-64`), `page` ohne synthetisches `page`-Array, `assign` mit abgeschalteten Plugins, `quiz` mit `timeclose < timeopen` |
| **(c) Kursseite kaputt** | sehr selten | `introformat` mit unzulässigem Wert, wenn er beim Kursseiten-Cachebau gerendert wird (label immer, page/url bei `showdescription=1`) — mit dem Vorbehalt aus Teil I §8 |
| **(d) Wirkung über den Kurs hinaus** | **fünf belegte Fälle** | `forum.forcesubscribe = 2` (Mails an alle), `assign.teamsubmissiongroupingid` mit Fremd-Grouping, `choice.optionid[]` aus einer fremden Instanz, `assign.sendnotifications`, sowie `completionunlocked` (Lernendendaten) |
| **(e) DB-Fehler beim Schreiben** | selten, aber laut | NOT-NULL-ohne-Default-Spalten: `choice.intro`, `forum.name`/`intro`, `assign.name`/`intro`, `quiz.password`/`subnet`/`browsersecurity`/`preferredbehaviour`. Dazu `assign.markinganonymous` im Update ohne Schnappschuss |

**Der Befund gegen die Erwartung des Tickets:** kein Fehlerbild reicht an den zitierten
`availability`-Fall heran, und dieser ist über den Formularweg gar nicht erreichbar. Der gefährlichste
belegte Fall ist nicht ein unerlaubter Wert, sondern ein **fehlendes** Feld: `assign` schaltet ohne
Enable-Flags alle Abgabe-Plugins ab, `quiz` löscht ohne `feedbacktext` das Gesamtfeedback, `url`
löscht ohne `parameter_N` die URL-Parameter. **Der Schnappschuss ist die eigentliche Sicherung, nicht
die Wertprüfung.**

## 5. Nebenbefunde am heutigen Kurspilot-Code

Drei Fehler auf `origin/main`, unabhängig vom Vehikel gefunden und nachgeprüft:

- `create_url.php:64` setzt `displayoptions = serialize(['printintro' => 0])`. `url_add_instance()`
  baut das Feld an `mod/url/lib.php:113-121` aus `$data->printintro` neu auf und überschreibt den Wert.
  Wirkungslos; das Ergebnis stimmt nur zufällig.
- `create_page.php:73` setzt `printheading = 1`. Das Feld existiert in Moodle 5.0 nicht mehr — es kommt
  weder in `mod/page/db/install.xml` noch in `mod/page/lib.php` noch im Formular vor. Tote Fracht.
- `create_url.php:28` deklariert `externalurl` als `PARAM_URL`. `clean_param()` verwirft bei jeder
  Syntaxabweichung **still zu `''`** (`lib/classes/param.php:1039-1052`) — strenger als Moodles eigenes
  Formular, das serverrelative Links und `mailto:` akzeptiert. Ergebnis: gültige Eingaben landen als
  leere URL in der DB und die Aktivitätsseite zeigt `invalidstoredurl`.

Dazu ein Verhaltensunterschied: `create_choice.php` begrenzt die Antwortoptionen auf 2–6. Diese Grenze
ist eine Kurspilot-Erfindung; Moodle verlangt nur `option[0]` (`mod/choice/mod_form.php:81-83`).

Diese vier Punkte sind **nicht** Teil dieser Recherche-Entscheidung und gehören als eigene Tickets
verfolgt.


---

## Offene Punkte

### Bündel A (label, page, url)


- **`char(255)`-Überlänge bei `name`:** ob `$DB->insert_record()` einen `dml_write_exception` wirft oder der DB-Treiber stillschweigend kürzt, hängt vom DB-Strictmode ab. Ich habe keine Längenprüfung in `moodle_database` gefunden, aber auch keinen expliziten Beleg für das Wurffverhalten in dieser Installation. Der Formular-Weg fängt es clientseitig ab (`addRule(..., 'maxlength', 255, 'client')`) — clientseitig heißt: über den Webservice nicht wirksam.
- **`course`-Spalte mit ungültiger Kurs-ID:** kein FK in den `install.xml`-Dateien; welche Seite genau bricht, habe ich nicht nachvollzogen. Praktisch nicht erreichbar, weil `add_moduleinfo()` den Wert selbst setzt.
- **`page_update_instance()` ohne `$data->page`:** dass `content` auf `null` gesetzt wird, folgt direkt aus `mod/page/lib.php:160-161`. Ob die zusätzlichen PHP-8-Warnings bei aktivem Developer-Debugging die JSON-Antwort des Webservice zerlegen, habe ich nicht ausgeführt — unbelegt.
- **`introformat`-`coding_exception` beim Kursseiten-Cachebau:** der Code-Pfad ist belegt (`mod/label/lib.php:164` → `lib/weblib.php:874` → `lib/classes/formatting.php:279`), die tatsächliche Ausgabe (Kursseite komplett weiß vs. Teilausgabe) habe ich nicht laufen lassen.
- **`url` mit `display = 6` (Popup) und fehlenden `popupwidth`/`popupheight`:** `mod/url/lib.php:115-116` liest bedingungslos; ich habe nicht geprüft, ob `null` in den serialisierten Optionen später auf 620/450 zurückfällt — laut `mod/url/lib.php:231-232` (`empty()`-Prüfung) sollte es das, aber nicht ausgeführt.

### Bündel B (resource, folder, choice)


- **Nachträgliche Korrektur eines `resource.display`-Werts außerhalb der Admin-Freigabe `resource/displayoptions`**: `resourcelib_get_displayoptions()` `lib/resourcelib.php:111-138` nimmt den aktuellen Wert per `$current` immer mit auf, das Formular zeigt ihn also weiter an. Ob es irgendwo eine Stelle gibt, die einen nicht freigegebenen Wert beim Anzeigen erzwingt oder korrigiert, habe ich nicht gefunden — vermutlich nein, aber **unbelegt**.
- **Verhalten der DB bei fehlendem `choice.intro` in nicht-strict-MySQL / PostgreSQL**: Ich habe die Spaltendefinition (`mod/choice/db/install.xml:12`, NOT NULL ohne DEFAULT) und den Spaltenfilter (`lib/dml/mysqli_native_moodle_database.php:1487`) belegt, aber keinen realen Schreibversuch ausgeführt. Dass das (e) DB-Fehler ergibt, ist aus der Definition abgeleitet, nicht nachgestellt.
- **PHP-Fehlerklasse bei fehlendem `$data->files` / `$data->display`** (`mod/folder/lib.php:106`, `mod/resource/locallib.php:541,546`, `mod/resource/lib.php:152`): unter PHP 8 ist "Undefined property" eine Warning, kein Fatal. Ob Moodles Debug-Handler das in Entwicklungs-Debuglevel zu einer Exception eskaliert und damit den ganzen `add_moduleinfo()`-Transaktionsblock (`course/modlib.php:127`) zurückrollt, habe ich nicht verifiziert — **unbelegt**.
- **Konkretes Fehlerbild bei einer fremden `optionid` in `update_choice`**: Der fehlende `choiceid`-Check in `mod/choice/lib.php:160-163` ist belegt, die Auswirkung auf die fremde Abstimmung ist daraus abgeleitet, nicht nachgestellt.
(Geklärt, nicht mehr offen: `mod/choice/settings.php` existiert nicht — choice hat keine Admin-Einstellungen als dritte Default-Quelle. Für choice gelten daher nur DB-Default und Formular-Default.)

### Bündel C (forum, assign, quiz)


- **Genauer DB-Fehlertyp** bei fehlendem NOT-NULL-ohne-Default-Feld (`forum.name`, `quiz.password`, `quiz.subnet`, `quiz.browsersecurity`, `quiz.preferredbehaviour`): Ich habe die Schemadefinition belegt und daraus auf (e) geschlossen, aber keinen Lauf gegen eine echte Datenbank gemacht. Ob Moodles `moodle_database::insert_record()` vorher normalisiert (z.B. `null` → `''` bei char-Spalten), habe ich nicht in `lib/dml/` nachverfolgt.
- **`mod/forum/mod_form.php:274`** – `$defaultgradingvalue` für `grade_forum`: die Herkunft (Admin-Setting vs. `$CFG->gradepointdefault`) habe ich nicht bis zur Definition zurückverfolgt.
- **`assignsubmission_comments`**: ob dieses Plugin eine eigene `save_settings()` besitzt, habe ich nur negativ per Grep über `mod/assign/submission/*/locallib.php` festgestellt (`grep 'function save_settings'` liefert nur `file` und `onlinetext`). Eine Datei-für-Datei-Prüfung des Plugins habe ich nicht gemacht.
- **`quizaccess_seb`**: Umfang und Pflichtfelder der ~20 SEB-Einstellungen habe ich nur über die Existenz von `mod/quiz/accessrule/seb/db/install.xml` und `rule.php:160` belegt, nicht im Detail ausgezählt.
- **`assign` Formular-Zeilennummern im Bereich 124–260**: ich habe den Block `mod/assign/mod_form.php:40-300` gelesen und die Elemente zugeordnet; einzelne der genannten Zeilennummern für `selectyesno`-Elemente können um ±2 abweichen, da ich sie aus dem gelesenen Block abgeleitet und nicht einzeln per Grep bestätigt habe.
- **`forum` Fehlerbild bei `blockperiod`/`blockafter`/`warnafter`**: Ich habe belegt, dass keine Validierung existiert, aber `forum_check_throttling()` nicht gelesen – die konkrete Laufzeitwirkung eines widersprüchlichen Paars ist damit als (a) eingestuft, aber nicht am Code nachvollzogen.
- **`quiz.precreateattempts`**: nullable ohne DEFAULT laut `install.xml`. Ob `quiz_add_instance()` ohne dieses Feld sauber durchläuft (nullable ⇒ vermutlich ja), habe ich nicht verifiziert.

---

*Recherche gefahren am 2026-08-21 gegen `/opt/moodle` (5.0.8) und `origin/main`. Drei Modultyp-Bündel parallel, gemeinsame Schicht separat.*
