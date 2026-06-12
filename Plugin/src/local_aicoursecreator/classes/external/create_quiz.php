<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_aicoursecreator\external;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/mod/quiz/lib.php');

use external_api;
use external_function_parameters;
use external_value;
use external_single_structure;
use context_course;
use invalid_parameter_exception;

/**
 * Creates a mod_quiz activity. Drei Modi geben komplette Settings-Kombinationen vor:
 *
 *  - lerncheck (Default): Lernstandscheck. Unbegrenzte Versuche, beste Bewertung,
 *                         deferredfeedback (Auswertung nach Abgabe), kein Zeitlimit,
 *                         gradepass ~80%.
 *  - intensiv:            Intensiv-Ueben. Unbegrenzte Versuche, Durchschnittsnote,
 *                         immediatefeedback (sofortige Rueckmeldung pro Frage),
 *                         kein Zeitlimit, gradepass ~80%.
 *  - bewertung:           Bewertungsmodus. Genau ein Versuch, beste Bewertung,
 *                         deferredfeedback, Zeitlimit konfigurierbar, gradepass ~50%.
 *
 * Explizit gesetzte Parameter (gradepass, timelimit) ueberschreiben den Modus-Default
 * (Layered Defaults).
 */
class create_quiz extends external_api {

    /** @var string[] Erlaubte Modi. */
    const ALLOWED_MODES = ['lerncheck', 'intensiv', 'bewertung'];

    // Bitmasks fuer review*-Felder, identisch zu \mod_quiz\question\display_options.
    // quiz_process_options() (mod/quiz/lib.php) berechnet diese Felder nicht aus
    // den hier gesetzten Kombi-Werten, sondern aus einzelnen "<feld><zeitpunkt>"-
    // Formularfeldern (z.B. "attemptduring"). apply_review_options() uebersetzt
    // unsere Kombi-Bitmasken in diese Einzelfelder, damit sie erhalten bleiben.
    const REVIEW_DURING          = 0x10000;
    const REVIEW_IMMEDIATELY     = 0x01000;
    const REVIEW_LATER_WHILE_OPEN = 0x00100;
    const REVIEW_AFTER_CLOSE     = 0x00010;

    /**
     * Liefert die Settings-Kombination fuer einen Modus.
     *
     * @param string $mode Einer von self::ALLOWED_MODES.
     * @return array Settings-Map.
     */
    protected static function mode_defaults(string $mode): array {
        switch ($mode) {
            case 'intensiv':
                return [
                    'preferredbehaviour' => 'immediatefeedback',
                    'attempts'           => 0,
                    'grademethod'        => QUIZ_GRADEAVERAGE,
                    'timelimit'          => 0,
                    'gradepass'          => 80.0,
                    // Review: sofort + nach Versuch sichtbar (Lernen durch Erklaerung).
                    'reviewattempt'          => 0x11110,
                    'reviewcorrectness'      => 0x11110,
                    'reviewmarks'            => 0x11110,
                    'reviewspecificfeedback' => 0x11110,
                    'reviewgeneralfeedback'  => 0x11110,
                    'reviewrightanswer'      => 0x11110,
                    'reviewoverallfeedback'  => 0x11000,
                ];

            case 'bewertung':
                return [
                    'preferredbehaviour' => 'deferredfeedback',
                    'attempts'           => 1,
                    'grademethod'        => QUIZ_GRADEHIGHEST,
                    'timelimit'          => 0,
                    'gradepass'          => 50.0,
                    // Review: erst nach Schliessung des Quiz (Bit 0x10000 = afterclose).
                    'reviewattempt'          => 0x10000,
                    'reviewcorrectness'      => 0x10000,
                    'reviewmarks'            => 0x10000,
                    'reviewspecificfeedback' => 0x10000,
                    'reviewgeneralfeedback'  => 0x10000,
                    'reviewrightanswer'      => 0x10000,
                    'reviewoverallfeedback'  => 0x10000,
                ];

            case 'lerncheck':
            default:
                return [
                    'preferredbehaviour' => 'deferredfeedback',
                    'attempts'           => 0,
                    'grademethod'        => QUIZ_GRADEHIGHEST,
                    'timelimit'          => 0,
                    'gradepass'          => 80.0,
                    // Review: Moodle-Standard – Feedback waehrend und nach Versuch.
                    'reviewattempt'          => 0x11110,
                    'reviewcorrectness'      => 0x11110,
                    'reviewmarks'            => 0x11110,
                    'reviewspecificfeedback' => 0x11110,
                    'reviewgeneralfeedback'  => 0x11110,
                    'reviewrightanswer'      => 0x11110,
                    'reviewoverallfeedback'  => 0x11000,
                ];
        }
    }

    /**
     * Setzt die "<feld><zeitpunkt>"-Formularfelder, aus denen
     * quiz_process_options() die review*-Spalten neu berechnet
     * (z.B. reviewattempt aus attemptduring/attemptimmediately/attemptopen/
     * attemptclosed). Ohne diese Felder wuerden unsere Kombi-Bitmasken aus
     * mode_defaults() von quiz_process_options() verworfen (auf 0 gesetzt).
     *
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param array $reviewbitmasks Map von 'review<aspekt>' (z.B. 'reviewattempt')
     *        auf die Kombi-Bitmaske aus mode_defaults().
     */
    protected static function apply_review_options(\stdClass $moduleinfo, array $reviewbitmasks): void {
        $timings = [
            'during'      => self::REVIEW_DURING,
            'immediately' => self::REVIEW_IMMEDIATELY,
            'open'        => self::REVIEW_LATER_WHILE_OPEN,
            'closed'      => self::REVIEW_AFTER_CLOSE,
        ];

        foreach ($reviewbitmasks as $aspect => $bitmask) {
            $field = substr($aspect, strlen('review')); // 'reviewattempt' -> 'attempt'
            foreach ($timings as $when => $bit) {
                $moduleinfo->{$field . $when} = ($bitmask & $bit) ? 1 : 0;
            }
        }
    }

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'   => new external_value(PARAM_INT,   'Course ID'),
            'sectionnum' => new external_value(PARAM_INT,   'Section number (0-based)'),
            'name'       => new external_value(PARAM_TEXT,  'Quiz title'),
            'intro'      => new external_value(PARAM_RAW,   'Quiz description (HTML, optional)', VALUE_DEFAULT, ''),
            'mode'       => new external_value(PARAM_ALPHA, "Test-Modus: 'lerncheck' (Default), 'intensiv' oder 'bewertung'", VALUE_DEFAULT, 'lerncheck'),
            'gradepass'  => new external_value(PARAM_FLOAT, 'Bestehensgrenze in Prozent (0-100). 0 = Modus-Default verwenden.', VALUE_DEFAULT, 0),
            'timelimit'  => new external_value(PARAM_INT,   'Zeitlimit in Sekunden (0 = unbegrenzt / Modus-Default). Nur fuer Bewertungsmodus relevant.', VALUE_DEFAULT, 0),
            'visible'    => new external_value(PARAM_INT,   'Visible (1) or hidden (0)', VALUE_DEFAULT, 1),
        ]);
    }

    public static function execute(
        int    $courseid,
        int    $sectionnum,
        string $name,
        string $intro = '',
        string $mode = 'lerncheck',
        float  $gradepass = 0,
        int    $timelimit = 0,
        int    $visible = 1
    ): array {
        global $DB, $CFG;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'name'       => $name,
            'intro'      => $intro,
            'mode'       => $mode,
            'gradepass'  => $gradepass,
            'timelimit'  => $timelimit,
            'visible'    => $visible,
        ]);

        $modekey = strtolower($params['mode']);
        if (!in_array($modekey, self::ALLOWED_MODES, true)) {
            throw new invalid_parameter_exception(
                "Unbekannter mode '{$params['mode']}'. Erlaubt: " . implode(', ', self::ALLOWED_MODES)
            );
        }

        $defaults = self::mode_defaults($modekey);

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);

        $moduleinfo = new \stdClass();
        $moduleinfo->modulename  = 'quiz';
        $moduleinfo->module      = $DB->get_field('modules', 'id', ['name' => 'quiz'], MUST_EXIST);
        $moduleinfo->course      = $params['courseid'];
        $moduleinfo->section     = $params['sectionnum'];
        $moduleinfo->name        = $params['name'];
        $moduleinfo->visible     = $params['visible'];

        // Intro / description.
        $moduleinfo->intro       = $params['intro'];
        $moduleinfo->introformat = FORMAT_HTML;
        $moduleinfo->showdescription = 0;

        // Frageverhalten (Modus-spezifisch).
        $moduleinfo->preferredbehaviour = $defaults['preferredbehaviour'];

        // Timing. Layered Defaults: expliziter timelimit-Parameter (>0) ueberschreibt Modus-Default.
        $moduleinfo->timeopen    = 0;
        $moduleinfo->timeclose   = 0;
        $moduleinfo->timelimit   = $params['timelimit'] > 0 ? $params['timelimit'] : $defaults['timelimit'];
        $moduleinfo->overduehandling = 'autosubmit';
        $moduleinfo->graceperiod = 0;

        // Versuche und Bewertungsmethode (Modus-spezifisch).
        $moduleinfo->attempts      = $defaults['attempts'];
        $moduleinfo->attemptonlast = 0;
        $moduleinfo->grademethod   = $defaults['grademethod'];

        // Layout.
        $moduleinfo->questionsperpage = 1;
        $moduleinfo->navmethod        = 'free';

        // Antwortoptionen gemischt (alle Modi).
        $moduleinfo->shuffleanswers = 1;

        // Review-Optionen (Modus-spezifisch). quiz_process_options() berechnet
        // die review*-Spalten aus Einzel-Formularfeldern neu, siehe
        // apply_review_options().
        self::apply_review_options($moduleinfo, [
            'reviewattempt'          => $defaults['reviewattempt'],
            'reviewcorrectness'      => $defaults['reviewcorrectness'],
            'reviewmarks'            => $defaults['reviewmarks'],
            'reviewspecificfeedback' => $defaults['reviewspecificfeedback'],
            'reviewgeneralfeedback'  => $defaults['reviewgeneralfeedback'],
            'reviewrightanswer'      => $defaults['reviewrightanswer'],
            'reviewoverallfeedback'  => $defaults['reviewoverallfeedback'],
        ]);

        // Darstellung.
        $moduleinfo->questiondecimalpoints = -1;
        $moduleinfo->decimalpoints         = 2;
        $moduleinfo->showuserpicture       = 0;
        $moduleinfo->showblocks            = 0;
        $moduleinfo->completionattemptsexhausted = 0;
        $moduleinfo->completionminattempts       = 0;
        // quiz_process_options() liest $quiz->quizpassword (Formularfeld-Name)
        // und schreibt es nach $quiz->password; ohne quizpassword wirft Moodle
        // 5.0 "Undefined property: stdClass::$quizpassword".
        $moduleinfo->password   = '';
        $moduleinfo->quizpassword = '';
        $moduleinfo->subnet     = '';
        $moduleinfo->browsersecurity = '-';
        $moduleinfo->delay1     = 0;
        $moduleinfo->delay2     = 0;

        // edit_module_post_actions() (course/modlib.php, von add_moduleinfo()
        // aufgerufen) liest $moduleinfo->cmidnumber unconditional beim Sync
        // mit grade_item->idnumber; ohne dieses Feld wirft Moodle 5.0
        // "Undefined property: stdClass::$cmidnumber".
        $moduleinfo->cmidnumber = '';

        // Bewertung: gradepass als Prozentsatz von grade=100 (Moodle-Standard).
        // Layered Defaults: expliziter gradepass-Parameter (>0) ueberschreibt Modus-Default.
        $moduleinfo->grade     = 100;
        $moduleinfo->gradepass = $params['gradepass'] > 0 ? $params['gradepass'] : $defaults['gradepass'];
        $moduleinfo->gradecat  = 0;

        $moduleinfo = add_moduleinfo($moduleinfo, $course);

        return [
            'cmid'    => (int) $moduleinfo->coursemodule,
            'mode'    => $modekey,
            'message' => 'Quiz "' . $params['name'] . '" successfully created (mode=' . $modekey . ').',
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid'    => new external_value(PARAM_INT,   'Course module ID of the created quiz'),
            'mode'    => new external_value(PARAM_ALPHA, 'Tatsaechlich angewendeter Modus'),
            'message' => new external_value(PARAM_TEXT,  'Success message'),
        ]);
    }
}
