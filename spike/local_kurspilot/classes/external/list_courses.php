<?php
// SPIKE — Wegwerfcode zu Issue #294. Kein Produktionscode.

namespace local_kurspilot\external;

use context_course;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/**
 * Lists the courses the calling teacher may use Kurspilot in.
 */
class list_courses extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([]);
    }

    public static function execute(): array {
        self::validate_parameters(self::execute_parameters(), []);

        $courses = [];
        foreach (enrol_get_my_courses('id, fullname, shortname, visible') as $course) {
            $context = context_course::instance($course->id);
            if (!has_capability('local/kurspilot:use', $context)) {
                continue;
            }
            self::validate_context($context);
            $courses[] = [
                'id' => (int) $course->id,
                'fullname' => (string) $course->fullname,
                'shortname' => (string) $course->shortname,
                'visible' => (bool) $course->visible,
            ];
        }

        return ['courses' => $courses];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'courses' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(PARAM_INT, 'Course id'),
                    'fullname' => new external_value(PARAM_TEXT, 'Course full name'),
                    'shortname' => new external_value(PARAM_TEXT, 'Course short name'),
                    'visible' => new external_value(PARAM_BOOL, 'Whether the course is visible'),
                ])
            ),
        ]);
    }
}
