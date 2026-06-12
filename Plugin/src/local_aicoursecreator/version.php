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
// 1.0.12 (2026061102) – Neu (#9, ADR-0001):
//   - local_aicoursecreator_create_mc_question – legt eine MC-Frage
//     (qtype_multichoice) in einer Fragenbank-Kategorie an. V1-Regeln: genau
//     eine richtige Antwort (fraction=1.0), variable Optionen, single=1,
//     shuffleanswers=1, kein Teilpunkte-Modell. Erzeugt question +
//     question_bank_entries + question_versions (version=1) +
//     question_answers + qtype_multichoice_options.
//   - local_aicoursecreator_update_mc_question – speichert Edits als NEUE
//     Moodle-Version derselben Frage (gleiche questionbankentryid, neue
//     question.id, neue question_versions-Zeile mit max+1). Alte Version
//     bleibt fuer bestehende Quiz-Attempts gueltig (ADR-0001).
//   - local_aicoursecreator_get_question – liefert die latest version einer
//     Frage in einer Kategorie, identifiziert per Name oder questionid (zur
//     eindeutigen Identifikation vor einem Edit).
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
