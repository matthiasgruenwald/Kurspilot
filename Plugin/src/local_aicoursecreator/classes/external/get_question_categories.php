<?php
// This file is part of Moodle - http://moodle.org/

namespace local_aicoursecreator\external;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');
require_once($CFG->libdir . '/questionlib.php');

use external_api;
use external_function_parameters;
use external_value;
use external_single_structure;
use external_multiple_structure;
use context_course;

/**
 * Returns all question bank categories of a course's question context.
 *
 * Includes the "top" category (parent=0, name='top') so that the returned
 * `parent` values are always resolvable within the result set.
 */
class get_question_categories extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function execute(int $courseid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
        ]);

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);

        // Stellt sicher, dass die top-Kategorie existiert (legt sie ggf. an).
        question_get_top_category($context->id, true);

        $categories = $DB->get_records('question_category',
            ['contextid' => $context->id],
            'parent ASC, sortorder ASC, name ASC',
            'id, name, parent'
        );

        $result = [];
        foreach ($categories as $c) {
            $result[] = [
                'id'     => (int) $c->id,
                'name'   => $c->name,
                'parent' => (int) $c->parent,
            ];
        }

        return $result;
    }

    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(
            new external_single_structure([
                'id'     => new external_value(PARAM_INT,  'Category ID'),
                'name'   => new external_value(PARAM_TEXT, 'Category name'),
                'parent' => new external_value(PARAM_INT,  'Parent category ID (0 for the top category itself)'),
            ])
        );
    }
}
