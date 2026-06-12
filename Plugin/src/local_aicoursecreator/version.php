<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_aicoursecreator';
$plugin->version   = 2026061102;  // Format: YYYYMMDDNN – NN bei mehreren Releases pro Tag hochzählen
$plugin->requires  = 2022041900;  // Moodle 4.0+
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = '1.0.12';

// Changelog:
// 1.0.12 (2026061102) – Erweiterungen fuer Quiz-Bestehensabschluss (#10):
//   - set_completion: neuer Parameter completionpassgrade (0/1). Bei
//     completion=2 + completionpassgrade=1 wird course_modules.completionpassgrade
//     gesetzt – Aktivitaet gilt erst als abgeschlossen, wenn die
//     Bestehensgrenze (gradepass) erreicht ist. Aktuell genutzt fuer mod_quiz.
//   - set_restriction: neue Parameter condition_type ('quiz_passed') und
//     condition_target_cmid. Im Modus 'quiz_passed' wird eine availability-
//     Notenbedingung gebaut: {type:"grade", id:<grade_item_id>, min:<gradepass>}.
//     Die grade_item-ID wird aus grade_items (itemmodule=quiz, iteminstance=
//     quiz.id) ermittelt. Standardpfad (Completion-Bedingungen) bleibt
//     unveraendert; require_cmids ist jetzt optional (Default []), damit
//     der Aufruf ohne require_cmids im quiz_passed-Modus moeglich ist.
//   - Keine impliziten Defaults: ohne expliziten quiz_passed-Aufruf wird
//     keine Notenbedingung gesetzt.
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
