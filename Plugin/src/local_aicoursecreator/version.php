<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_aicoursecreator';
$plugin->version   = 2026061902;  // Format: YYYYMMDDNN – NN bei mehreren Releases pro Tag hochzählen
$plugin->requires  = 2022041900;  // Moodle 4.0+
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = '1.0.24';

// Changelog:
// 1.0.24 (2026061902) – Neu (#77):
//   - local_aicoursecreator_ensure_question_bank + moodle_ensure_question_bank:
//     legt eine benannte Kurs-/Projekt-Fragensammlung als standard-mod_qbank
//     an oder waehlt eine gleichnamige bestehende aus (idempotent).
//   - create_question_category + get_question_categories schreiben/lesen
//     Kategorien nicht mehr ueber die systemweite Altlast-Fragensammlung,
//     sondern explizit in der ausgewaehlten benannten Fragensammlung
//     (`questionbankid`/CMID erforderlich).
// 1.0.23 (2026061901) – Neu (#76):
//   - local_aicoursecreator_move_section + moodle_move_section: verschiebt
//     einen bestehenden Kursabschnitt an eine neue Position, ohne Name,
//     Beschreibung, Aktivitaeten oder Sichtbarkeit zu aendern. Nutzt
//     Moodle-Core move_section_to() und bleibt auf moodle/course:update
//     begrenzt.
// 1.0.22 (2026061900) – Bugfix (#73):
//   - AI Course Creator Service ist nicht mehr auf eine manuell gepflegte
//     authorised-users-Liste angewiesen (restrictedusers=0).
//   - Lesefunktionen in db/services.php tragen keine zusaetzlichen
//     Capability-Metadaten mehr; Token/REST laufen ueber die globale
//     Kurspilot-Nutzungsrolle, Lesen/Schreiben im Zielkurs weiter ueber die
//     require_capability()-Pruefungen der einzelnen externen Funktionen.
// 1.0.21 (2026061801) – Bugfix:
//   - get_course_catalog nutzt wie get_sections/get_modules nur
//     validate_context(); eingeschriebene Nutzer brauchen nicht die
//     Capability moodle/course:view ("Kurse ohne Beteiligung anzeigen").
// 1.0.20 (2026061800) – Wartungsrelease:
//   - Versions-Bump, damit Moodle beim Plugin-Update die Webservice-
//     Registrierung inklusive local_aicoursecreator_get_course_catalog
//     sicher aktualisiert.
// 1.0.19 (2026061401) – Neu/Bugfix:
//   - Neu upload_assign_intro_image: Bilder in den mod_assign intro-
//     Dateibereich hochladen und per @@PLUGINFILE@@ direkt in die
//     Aufgabenbeschreibung einbetten.
//   - Bugfix upload_assignfile: fehlendes introattachments-Feld defensiv
//     behandeln.
// 1.0.18 (2026061203) – Neu: fehlende Kursabschnitte idempotent anlegen.
//   - local_aicoursecreator_ensure_section + moodle_ensure_section:
//     nutzt Moodle-Core course_create_sections_if_missing(), damit Abschnitte
//     vor update/create-Aufrufen existieren und invalidrecord vermieden wird.
// 1.0.17 (2026061202) – Bugfix: Moodle 5.0 Kompatibilitaet fuer Aufgaben.
//   - create_assign (#2): $moduleinfo->cmidnumber ergaenzt –
//     edit_module_post_actions() (course/modlib.php, von add_moduleinfo()
//     aufgerufen) liest dieses Feld beim grade_item-Sync unconditional,
//     fehlte es warf Moodle 5.0 "Undefined property: stdClass::$cmidnumber".
// 1.0.16 (2026061201) – Neu (#13, ADR-0001):
//   - local_aicoursecreator_add_questions_to_quiz – fuegt Fragenbank-Fragen
//     (#9) zu einem Quiz (#6) als question_references mit version=null
//     ("immer aktuellste Version") hinzu. Reihenfolge folgt questionids[],
//     Duplikate (gleiche questionbankentryid) werden uebersprungen. Wrapper
//     um Moodle-Core quiz_add_quiz_question() + quiz_update_sumgrades() +
//     rebuild_course_cache(). Antwort enthaelt 'slots': aktueller Quiz-
//     Inhalt in Slot-Reihenfolge mit jeweils aktuellster questionid/version
//     je Frage.
// 1.0.15 (2026061105) – Bugfix: letzte 6 Tests (Moodle 5.0 Schemaaenderungen).
//   - update_mc_question (#9): $oldquestion->category existiert in Moodle 5.0
//     nicht mehr (question.category-Spalte entfernt; Kategorie liegt jetzt
//     auf question_bank_entries.questioncategoryid). Neue question-Zeile
//     verwendet jetzt $entry->questioncategoryid.
//   - set_restriction quiz_passed (#10): mod_quiz hat seit Moodle 5.0 keine
//     gradepass-Spalte mehr (nur noch grade_items.gradepass). SELECT auf
//     quiz.gradepass entfernt, Bestehensgrenze kommt ausschliesslich aus
//     grade_items.
//   - db/services.php: Core-Funktion mod_quiz_get_quizzes_by_courses (lesend)
//     zum Service hinzugefuegt – wird von quiz-modes.integration.test.js
//     genutzt, um gespeicherte Quiz-Settings nach create_quiz zu verifizieren.
// 1.0.14 (2026061104) – Bugfix: weitere Moodle 5.0 Kompatibilitaet.
//   - create_quiz (#6/#11): $moduleinfo->cmidnumber ergaenzt –
//     edit_module_post_actions() (course/modlib.php, von add_moduleinfo()
//     aufgerufen) liest dieses Feld beim grade_item-Sync unconditional,
//     fehlte es warf Moodle 5.0 "Undefined property: stdClass::$cmidnumber".
//   - get_question (#9): Capability moodle/question:view existiert in
//     aktuellem Moodle nicht mehr (nur viewmine/viewall) -> "nopermissions
//     ([[question:view]])". Auf moodle/question:viewall umgestellt
//     (classes/external/get_question.php + db/services.php).
// 1.0.13 (2026061103) – Bugfix: Moodle 5.0 Kompatibilitaet (mod_qbank).
//   - create_question_category + get_question_categories (#7/#9): Fragen-
//     kategorien liegen seit Moodle 5.0 im Kontext einer "Question bank"-
//     Aktivitaet (mod_qbank), nicht mehr direkt im Kurskontext.
//     question_get_top_category() liefert fuer CONTEXT_COURSE jetzt false
//     (statt die top-Kategorie anzulegen). Fix: Kontext ueber
//     question_bank_helper::get_default_open_instance_system_type() aufloesen
//     (legt bei Bedarf die system-mod_qbank-Instanz des Kurses an).
//   - Tabellenname-Tippfehler durchgaengig korrigiert: question_category ->
//     question_categories (create_question_category, get_question_categories,
//     create_mc_question, get_question, update_mc_question).
//   - create_quiz (#6/#11): $moduleinfo->quizpassword ergaenzt –
//     quiz_process_options() liest dieses Feld unconditional, fehlte es warf
//     Moodle 5.0 "Undefined property: stdClass::$quizpassword".
//   - create_quiz (#11): review*-Bitmasken aus mode_defaults() wurden von
//     quiz_process_options() verworfen, weil die Funktion sie aus einzelnen
//     "<feld><zeitpunkt>"-Formularfeldern neu berechnet. Neue Methode
//     apply_review_options() setzt diese Felder passend zu den Kombi-Masken.
// 1.0.12 (2026061102) – Welle 3:
//   - Neu (#9, ADR-0001): MC-Fragen erstellen und bearbeiten mit nativer
//     Versionierung.
//     - local_aicoursecreator_create_mc_question – legt eine MC-Frage
//       (qtype_multichoice) in einer Fragenbank-Kategorie an. V1-Regeln:
//       genau eine richtige Antwort (fraction=1.0), variable Optionen,
//       single=1, shuffleanswers=1, kein Teilpunkte-Modell. Erzeugt
//       question + question_bank_entries + question_versions (version=1)
//       + question_answers + qtype_multichoice_options.
//     - local_aicoursecreator_update_mc_question – speichert Edits als NEUE
//       Moodle-Version derselben Frage (gleiche questionbankentryid, neue
//       question.id, neue question_versions-Zeile mit max+1). Alte Version
//       bleibt fuer bestehende Quiz-Attempts gueltig (ADR-0001).
//     - local_aicoursecreator_get_question – liefert die latest version
//       einer Frage in einer Kategorie, identifiziert per Name oder
//       questionid (zur eindeutigen Identifikation vor einem Edit).
//   - Erweiterung (#10): Quiz-Bestehensabschluss und Sperre fuer Folgeaktivitaet.
//     - set_completion: neuer Parameter completionpassgrade (0/1). Bei
//       completion=2 + completionpassgrade=1 wird course_modules.
//       completionpassgrade gesetzt – Aktivitaet gilt erst als abgeschlossen,
//       wenn die Bestehensgrenze (gradepass) erreicht ist. Aktuell genutzt
//       fuer mod_quiz.
//     - set_restriction: neue Parameter condition_type ('quiz_passed') und
//       condition_target_cmid. Im Modus 'quiz_passed' wird eine availability-
//       Notenbedingung gebaut: {type:"grade", id:<grade_item_id>,
//       min:<gradepass>}. Die grade_item-ID wird aus grade_items (itemmodule=
//       quiz, iteminstance=quiz.id) ermittelt. Standardpfad (Completion-
//       Bedingungen) bleibt unveraendert; require_cmids ist jetzt optional
//       (Default []), damit der Aufruf ohne require_cmids im quiz_passed-
//       Modus moeglich ist.
//     - Keine impliziten Defaults: ohne expliziten quiz_passed-Aufruf wird
//       keine Notenbedingung gesetzt.
//   - Erweiterung (#11): create_quiz um Parameter `mode` (lerncheck|intensiv|
//     bewertung). Drei Modi mit jeweils dokumentierter Settings-Kombination:
//       * lerncheck (Default): deferredfeedback, unbegrenzte Versuche,
//         beste Bewertung, gradepass ~80% – Lernstandscheck (#6-Verhalten).
//       * intensiv: immediatefeedback, unbegrenzte Versuche, Durchschnittsnote,
//         gradepass ~80% – Intensiv-Ueben mit sofortiger Rueckmeldung.
//       * bewertung: deferredfeedback, genau 1 Versuch, beste Bewertung,
//         Review erst nach Schliessung, gradepass ~50%, Zeitlimit optional.
//     Layered Defaults: explizite gradepass/timelimit-Parameter ueberschreiben
//     den Modus-Default. Rueckgabewert enthaelt jetzt `mode`.
// 1.0.11 (2026061101) – Neu:
//   - local_aicoursecreator_create_quiz (#6) – legt ein Quiz (mod_quiz) mit
//     Lerncheck-Defaults an (unbegrenzte Versuche, beste Bewertung zaehlt,
//     kein Zeitlimit, gemischte Antworten). gradepass parametrisierbar
//     (Prozent von grade=100), ~80% empfohlen.
//   - create_question_category + get_question_categories (#7) – Fragenbank-
//     Kategorien je Unterthema/Inhaltsabschnitt. Kategorien werden im
//     Kurs-Fragenkontext unter der "top"-Kategorie angelegt;
//     create_question_category ist idempotent (gleicher Name+Parent ->
//     bestehende id, created=false statt Dublette).
// 1.0.10 (2026061100) – Bugfix: get_sections/get_modules verlangten faelschlich
//   moodle/course:view (Capability fuer Kurse OHNE Beteiligung). Eingeschriebene
//   Trainer/Studierende hatten diese nicht und bekamen "nopermissions".
//   validate_context() reicht fuer eingeschriebene Nutzer aus.
// 1.0.2 (2025041902) – Bugfix: course_modules hat kein timemodified-Feld
// 1.0.1 (2025041901) – Bugfixes:
//   - modlib.php require_once ergänzt (add_moduleinfo war nicht gefunden)
//   - markingworkflow + markingallocation in create_assign ergänzt
//   - update_* Funktionen: !== '' statt if() + timemodified immer setzen
//   - create_url + create_label als neue Funktionen
// 1.0.0 (2025041800) – Erstveröffentlichung
