<?php
// This file is part of Moodle - http://moodle.org/

namespace local_aicoursecreator\external;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');
require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/classes/local/bank/question_bank_helper.php');

use external_api;
use external_function_parameters;
use external_value;
use external_single_structure;
use context_course;
use core_question\local\bank\question_bank_helper;

/**
 * Creates (or returns the existing) question bank category in a course's
 * question context.
 *
 * Idempotent: if a category with the same name already exists under the
 * given parent, no duplicate is created – the existing id is returned with
 * created=false.
 */
class create_question_category extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
            'name'     => new external_value(PARAM_TEXT, 'Category name, convention: "<Abschnittsnummer> <Titel>", e.g. "7.2 Stoffe und ihre Eigenschaften"'),
            'parent'   => new external_value(PARAM_INT, 'Parent category ID (0 = create as child of the course top category)', VALUE_DEFAULT, 0),
        ]);
    }

    public static function execute(int $courseid, string $name, int $parent = 0): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'name'     => $name,
            'parent'   => $parent,
        ]);

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('moodle/question:managecategory', $context);

        // Seit Moodle 5.0 leben Fragenkategorien im Kontext einer "Question
        // bank"-Aktivitaet (mod_qbank), nicht mehr direkt im Kurskontext.
        // Der system-Typ wird je Kurs einmalig (idempotent) angelegt.
        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $bankcm = question_bank_helper::get_default_open_instance_system_type($course, true);
        $qbankcontext = $bankcm->context;

        $topcategory = question_get_top_category($qbankcontext->id, true);

        $parentid = $params['parent'] > 0 ? $params['parent'] : (int) $topcategory->id;

        // Idempotenz: existiert bereits eine Kategorie mit gleichem Namen unter
        // demselben Parent (im selben Kontext)?
        $existing = $DB->get_record('question_categories', [
            'contextid' => $qbankcontext->id,
            'parent'    => $parentid,
            'name'      => $params['name'],
        ]);

        if ($existing) {
            return [
                'id'      => (int) $existing->id,
                'created' => false,
                'message' => 'Question category "' . $params['name'] . '" already exists.',
            ];
        }

        $maxsortorder = $DB->get_field_sql(
            'SELECT MAX(sortorder) FROM {question_categories} WHERE parent = ?',
            [$parentid]
        );

        $record = new \stdClass();
        $record->name        = $params['name'];
        $record->contextid   = $qbankcontext->id;
        $record->info        = '';
        $record->infoformat  = FORMAT_HTML;
        $record->stamp       = make_unique_id_code();
        $record->parent      = $parentid;
        $record->sortorder   = ((int) $maxsortorder) + 1;
        $record->idnumber    = null;

        $newid = $DB->insert_record('question_categories', $record);

        return [
            'id'      => (int) $newid,
            'created' => true,
            'message' => 'Question category "' . $params['name'] . '" successfully created.',
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'id'      => new external_value(PARAM_INT, 'ID of the (existing or newly created) question category'),
            'created' => new external_value(PARAM_BOOL, 'true if a new category was created, false if an existing one was reused'),
            'message' => new external_value(PARAM_TEXT, 'Status message'),
        ]);
    }
}
