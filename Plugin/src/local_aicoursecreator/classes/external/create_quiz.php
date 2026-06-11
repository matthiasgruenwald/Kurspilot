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

/**
 * Creates a mod_quiz activity with "Lerncheck" defaults: unbegrenzte Versuche,
 * beste Bewertung zaehlt, kein Zeitlimit, Antwortoptionen gemischt.
 */
class create_quiz extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'   => new external_value(PARAM_INT,   'Course ID'),
            'sectionnum' => new external_value(PARAM_INT,   'Section number (0-based)'),
            'name'       => new external_value(PARAM_TEXT,  'Quiz title'),
            'intro'      => new external_value(PARAM_RAW,   'Quiz description (HTML, optional)', VALUE_DEFAULT, ''),
            'gradepass'  => new external_value(PARAM_FLOAT, 'Bestehensgrenze in Prozent (0-100), ~80 fuer Lernchecks empfohlen', VALUE_DEFAULT, 0),
            'visible'    => new external_value(PARAM_INT,   'Visible (1) or hidden (0)', VALUE_DEFAULT, 1),
        ]);
    }

    public static function execute(
        int    $courseid,
        int    $sectionnum,
        string $name,
        string $intro = '',
        float  $gradepass = 0,
        int    $visible = 1
    ): array {
        global $DB, $CFG;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'name'       => $name,
            'intro'      => $intro,
            'gradepass'  => $gradepass,
            'visible'    => $visible,
        ]);

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

        // Timing: kein Zeitfenster, kein Zeitlimit (Lerncheck-Default).
        $moduleinfo->timeopen    = 0;
        $moduleinfo->timeclose   = 0;
        $moduleinfo->timelimit   = 0;
        $moduleinfo->overduehandling = 'autosubmit';
        $moduleinfo->graceperiod = 0;

        // Versuche: unbegrenzt, beste Bewertung zaehlt (Lerncheck-Default).
        $moduleinfo->attempts      = 0;
        $moduleinfo->attemptonlast = 0;
        $moduleinfo->grademethod   = QUIZ_GRADEHIGHEST;

        // Layout.
        $moduleinfo->questionsperpage = 1;
        $moduleinfo->navmethod        = 'free';

        // Antwortoptionen gemischt (Lerncheck-Default).
        $moduleinfo->shuffleanswers = 1;

        // Review-Optionen: Standard-Moodle-Defaults (Feedback waehrend und nach Versuch).
        $moduleinfo->reviewattempt          = 0x11110;
        $moduleinfo->reviewcorrectness      = 0x11110;
        $moduleinfo->reviewmarks            = 0x11110;
        $moduleinfo->reviewspecificfeedback = 0x11110;
        $moduleinfo->reviewgeneralfeedback  = 0x11110;
        $moduleinfo->reviewrightanswer      = 0x11110;
        $moduleinfo->reviewoverallfeedback  = 0x11000;

        // Darstellung.
        $moduleinfo->questiondecimalpoints = -1;
        $moduleinfo->decimalpoints         = 2;
        $moduleinfo->showuserpicture       = 0;
        $moduleinfo->showblocks            = 0;
        $moduleinfo->completionattemptsexhausted = 0;
        $moduleinfo->completionminattempts       = 0;
        $moduleinfo->password   = '';
        $moduleinfo->subnet     = '';
        $moduleinfo->browsersecurity = '-';
        $moduleinfo->delay1     = 0;
        $moduleinfo->delay2     = 0;

        // Bewertung: gradepass als Prozentsatz von grade=100 (Moodle-Standard).
        $moduleinfo->grade     = 100;
        $moduleinfo->gradepass = $params['gradepass'];
        $moduleinfo->gradecat  = 0;

        $moduleinfo = add_moduleinfo($moduleinfo, $course);

        return [
            'cmid'    => (int) $moduleinfo->coursemodule,
            'message' => 'Quiz "' . $params['name'] . '" successfully created.',
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid'    => new external_value(PARAM_INT,  'Course module ID of the created quiz'),
            'message' => new external_value(PARAM_TEXT, 'Success message'),
        ]);
    }
}
