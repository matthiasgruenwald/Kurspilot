<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Externer Dienst und Webservice-Funktionen.
 *
 * Die Funktionsliste muss deckungsgleich mit
 * {@see \local_kurspilot\privacy_surface::ALLOWED_TOOLS} sein - erzwungen
 * durch tests/privacy_surface_test.php.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_kurspilot_list_courses' => [
        'classname'   => 'local_kurspilot\external\list_courses',
        'description' => 'Lists the courses the calling teacher may use Kurspilot in.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_get_course_catalog' => [
        'classname'   => 'local_kurspilot\external\get_course_catalog',
        'description' => 'Reads a compact, filterable Moodle course catalog (sections, content, completion, restrictions) for course planning.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_get_modules' => [
        'classname'   => 'local_kurspilot\external\get_modules',
        'description' => 'Lists the activities of a course or section (cmid, type, name) for targeted access.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_get_sections' => [
        'classname'   => 'local_kurspilot\external\get_sections',
        'description' => 'Lists the sections of a course (id, number, name) for targeted access.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_get_question_categories' => [
        'classname'   => 'local_kurspilot\external\get_question_categories',
        'description' => 'Lists the question bank categories of a named question bank, for reuse instead of duplication.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_get_question' => [
        'classname'   => 'local_kurspilot\external\get_question',
        'description' => 'Reads the latest version of a single question, identified by name or questionid.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_get_quiz_cleanup_plan' => [
        'classname'   => 'local_kurspilot\external\get_quiz_cleanup_plan',
        'description' => 'Builds a manual, non-destructive cleanup plan for obsolete quiz slots - names findings and links, deletes nothing.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
    'local_kurspilot_list_context_files' => [
        'classname'   => 'local_kurspilot\external\list_context_files',
        'description' => 'Lists the calling teacher\'s Kurspilot context area (own working area only).',
        'type'        => 'read',
        'ajax'        => false,
    ],
    'local_kurspilot_read_context_file' => [
        'classname'   => 'local_kurspilot\external\read_context_file',
        'description' => 'Reads one file from the calling teacher\'s Kurspilot context area (own working area only).',
        'type'        => 'read',
        'ajax'        => false,
    ],
];

$services = [
    'Kurspilot' => [
        'functions' => [
            'local_kurspilot_list_courses',
            'local_kurspilot_get_course_catalog',
            'local_kurspilot_get_modules',
            'local_kurspilot_get_sections',
            'local_kurspilot_get_question_categories',
            'local_kurspilot_get_question',
            'local_kurspilot_get_quiz_cleanup_plan',
            'local_kurspilot_list_context_files',
            'local_kurspilot_read_context_file',
        ],
        'restrictedusers' => 0,
        'enabled' => 1,
        'shortname' => 'kurspilot',
    ],
];
