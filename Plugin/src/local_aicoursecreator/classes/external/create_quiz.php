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
 * Creates a mod_quiz activity. Drei Kurspilot-Modi geben komplette
 * Settings-Kombinationen vor:
 *
 *  - mini-check:       Kurzer Kompetenzcheck mit direkter Auswertung und
 *                      Selbsteinschätzung.
 *  - lernstandscheck:  Lernstandscheck mit späterer Auswertung,
 *                      Selbsteinschätzung und Lernplanung.
 *  - abschlusstest:    Abschlusstest mit Verbesserungsmöglichkeit,
 *                      keine Klassenarbeit.
 *
 * Explizit gesetzte Parameter (gradepass, timelimit) überschreiben den Modus-Default
 * (Layered Defaults).
 */
class create_quiz extends external_api {

    /** @var string[] Native Kurspilot-Modi. */
    const NATIVE_MODES = ['mini-check', 'lernstandscheck', 'abschlusstest'];

    /** @var array Deprecated aliases kept for existing clients. */
    const DEPRECATED_MODE_ALIASES = [
        'intensiv'  => 'mini-check',
        'lerncheck' => 'lernstandscheck',
        'bewertung' => 'abschlusstest',
    ];

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
     * @param string $mode Einer von self::NATIVE_MODES.
     * @return array Settings-Map.
     */
    public static function mode_defaults(string $mode): array {
        $afterattempt = self::REVIEW_IMMEDIATELY | self::REVIEW_LATER_WHILE_OPEN | self::REVIEW_AFTER_CLOSE;

        switch ($mode) {
            case 'mini-check':
                return [
                    'preferredbehaviour' => 'immediatecbm',
                    'attempts'           => 0,
                    'grademethod'        => QUIZ_GRADEHIGHEST,
                    'timelimit'          => 0,
                    'gradepass'          => 80.0,
                    'questionsperpage'    => 1,
                    'navmethod'           => 'free',
                    'shuffleanswers'      => 1,
                    'attemptonlast'       => 0,
                    'delay1'              => 0,
                    'delay2'              => 0,
                    'completion'          => 2,
                    'completionpassgrade' => 1,
                    'overallfeedback'     => [
                        'pass' => 'Bestanden: Du hast die Bestehensgrenze erreicht. Nutze die Rückmeldungen für deine nächsten Übungsschritte.',
                        'fail' => 'Noch nicht bestanden: Schau dir die Rückmeldungen an und starte einen neuen Versuch.',
                    ],
                    'reviewattempt'          => self::REVIEW_DURING | $afterattempt,
                    'reviewcorrectness'      => self::REVIEW_DURING | $afterattempt,
                    'reviewmarks'            => self::REVIEW_DURING | $afterattempt,
                    'reviewspecificfeedback' => self::REVIEW_DURING | $afterattempt,
                    'reviewgeneralfeedback'  => self::REVIEW_DURING | $afterattempt,
                    'reviewrightanswer'      => 0,
                    'reviewoverallfeedback'  => $afterattempt,
                ];

            case 'abschlusstest':
                return [
                    'preferredbehaviour' => 'deferredfeedback',
                    'attempts'           => 2,
                    'grademethod'        => QUIZ_GRADEAVERAGE,
                    'timelimit'          => 0,
                    'gradepass'          => 80.0,
                    'questionsperpage'    => 0,
                    'navmethod'           => 'free',
                    'shuffleanswers'      => 1,
                    'attemptonlast'       => 0,
                    'delay1'              => 900,
                    'delay2'              => 900,
                    'completion'          => 2,
                    'completionpassgrade' => 1,
                    'overallfeedback'     => [
                        'pass' => 'Bestanden: Du hast die Bestehensgrenze im Abschlusstest erreicht.',
                        'fail' => 'Noch nicht bestanden: Nutze die Rückmeldungen und den zweiten Versuch zur Verbesserung.',
                    ],
                    'reviewattempt'          => $afterattempt,
                    'reviewcorrectness'      => $afterattempt,
                    'reviewmarks'            => $afterattempt,
                    'reviewspecificfeedback' => $afterattempt,
                    'reviewgeneralfeedback'  => $afterattempt,
                    'reviewrightanswer'      => 0,
                    'reviewoverallfeedback'  => $afterattempt,
                ];

            case 'lernstandscheck':
            default:
                return [
                    'preferredbehaviour' => 'deferredcbm',
                    'attempts'           => 0,
                    'grademethod'        => QUIZ_GRADEHIGHEST,
                    'timelimit'          => 0,
                    'gradepass'          => 80.0,
                    'questionsperpage'    => 0,
                    'navmethod'           => 'free',
                    'shuffleanswers'      => 1,
                    'attemptonlast'       => 0,
                    'delay1'              => 300,
                    'delay2'              => 300,
                    'completion'          => 2,
                    'completionpassgrade' => 1,
                    'overallfeedback'     => [
                        'pass' => 'Bestanden: Du hast die Bestehensgrenze erreicht. Plane jetzt passende Vertiefungen oder den nächsten Lernschritt.',
                        'fail' => 'Noch nicht bestanden: Nutze die Rückmeldungen für deine Lernplanung und bearbeite gezielt die offenen Kompetenzen.',
                    ],
                    'reviewattempt'          => $afterattempt,
                    'reviewcorrectness'      => $afterattempt,
                    'reviewmarks'            => $afterattempt,
                    'reviewspecificfeedback' => $afterattempt,
                    'reviewgeneralfeedback'  => $afterattempt,
                    'reviewrightanswer'      => 0,
                    'reviewoverallfeedback'  => $afterattempt,
                ];
        }
    }

    public static function normalize_mode(string $mode): array {
        $modekey = strtolower(trim($mode));
        if (array_key_exists($modekey, self::DEPRECATED_MODE_ALIASES)) {
            return [
                'mode' => self::DEPRECATED_MODE_ALIASES[$modekey],
                'deprecated' => true,
                'original' => $modekey,
            ];
        }

        if (in_array($modekey, self::NATIVE_MODES, true)) {
            return [
                'mode' => $modekey,
                'deprecated' => false,
                'original' => $modekey,
            ];
        }

        throw new invalid_parameter_exception(
            "Unbekannter mode '{$mode}'. Erlaubt: " . implode(', ', self::NATIVE_MODES)
        );
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
    public static function apply_review_options(\stdClass $moduleinfo, array $reviewbitmasks): void {
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

    public static function review_fields(): array {
        return [
            'reviewattempt',
            'reviewcorrectness',
            'reviewmarks',
            'reviewspecificfeedback',
            'reviewgeneralfeedback',
            'reviewrightanswer',
            'reviewoverallfeedback',
        ];
    }

    public static function save_overall_feedback(int $quizid, array $feedback, float $gradepass = 80.0): void {
        global $DB;

        $DB->delete_records('quiz_feedback', ['quizid' => $quizid]);

        $records = [
            ['text' => $feedback['pass'], 'mingrade' => $gradepass, 'maxgrade' => 100.0],
            ['text' => $feedback['fail'], 'mingrade' => 0.0, 'maxgrade' => max(0.0, $gradepass - 0.00001)],
        ];

        foreach ($records as $feedbackrecord) {
            $record = new \stdClass();
            $record->quizid = $quizid;
            $record->feedbacktext = $feedbackrecord['text'];
            $record->feedbacktextformat = FORMAT_HTML;
            $record->mingrade = $feedbackrecord['mingrade'];
            $record->maxgrade = $feedbackrecord['maxgrade'];
            $DB->insert_record('quiz_feedback', $record);
        }
    }

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'   => new external_value(PARAM_INT,   'Course ID'),
            'sectionnum' => new external_value(PARAM_INT,   'Section number (0-based)'),
            'name'       => new external_value(PARAM_TEXT,  'Quiz title'),
            'intro'      => new external_value(PARAM_RAW,   'Quiz description (HTML, optional)', VALUE_DEFAULT, ''),
            'mode'       => new external_value(PARAM_ALPHANUMEXT, "Quizmodus: 'mini-check', 'lernstandscheck' (Default) oder 'abschlusstest'. Deprecated aliases: 'intensiv', 'lerncheck', 'bewertung'.", VALUE_DEFAULT, 'lernstandscheck'),
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
        string $mode = 'lernstandscheck',
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

        $moderesolution = self::normalize_mode($params['mode']);
        $modekey = $moderesolution['mode'];

        $defaults = self::mode_defaults($modekey);

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('local/aicoursecreator:use', $context);
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
        $moduleinfo->attemptonlast = $defaults['attemptonlast'];
        $moduleinfo->grademethod   = $defaults['grademethod'];

        // Layout.
        $moduleinfo->questionsperpage = $defaults['questionsperpage'];
        $moduleinfo->navmethod        = $defaults['navmethod'];

        // Antwortoptionen gemischt (alle Modi).
        $moduleinfo->shuffleanswers = $defaults['shuffleanswers'];

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
        $moduleinfo->completion                  = $defaults['completion'];
        $moduleinfo->completionview              = 0;
        $moduleinfo->completionpassgrade         = $defaults['completionpassgrade'];
        // quiz_process_options() liest $quiz->quizpassword (Formularfeld-Name)
        // und schreibt es nach $quiz->password; ohne quizpassword wirft Moodle
        // 5.0 "Undefined property: stdClass::$quizpassword".
        $moduleinfo->password   = '';
        $moduleinfo->quizpassword = '';
        $moduleinfo->subnet     = '';
        $moduleinfo->browsersecurity = '-';
        $moduleinfo->delay1     = $defaults['delay1'];
        $moduleinfo->delay2     = $defaults['delay2'];

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
        self::save_overall_feedback((int) $moduleinfo->instance, $defaults['overallfeedback'], (float) $moduleinfo->gradepass);

        return [
            'cmid'           => (int) $moduleinfo->coursemodule,
            'mode'           => $modekey,
            'deprecatedmode' => $moderesolution['deprecated'],
            'message'        => 'Quiz "' . $params['name'] . '" successfully created (mode=' . $modekey . ').',
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid'           => new external_value(PARAM_INT,   'Course module ID of the created quiz'),
            'mode'           => new external_value(PARAM_TEXT, 'Tatsächlich angewendeter Modus'),
            'deprecatedmode' => new external_value(PARAM_BOOL, 'True when a deprecated alias was accepted and mapped'),
            'message'        => new external_value(PARAM_TEXT,  'Success message'),
        ]);
    }
}
