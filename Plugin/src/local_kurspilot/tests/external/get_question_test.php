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

namespace local_kurspilot\external;

use core_external\external_api;

/**
 * Einzelne Frage in ihrer aktuellen Fassung serverseitig (#342):
 * eigenstaendige Portierung von local_coursepilot\external\get_question,
 * Vertrag (Feldnamen, Antwort-Optionen inkl. richtiger Antwort) identisch
 * zum lokalen Werkzeug.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(get_question::class)]
final class get_question_test extends \advanced_testcase {

    /**
     * Regelfall: die aktuelle Fassung inkl. Antworten und richtiger Antwort
     * wird per Name gefunden.
     */
    public function test_returns_latest_version_with_answers_by_name(): void {
        $this->resetAfterTest();

        [$course, $category] = $this->create_course_with_question_category();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);

        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $question = $questiongenerator->create_question('multichoice', 'one_of_four', ['category' => $category->id]);

        $result = get_question::execute((int) $category->id, $question->name);
        $result = external_api::clean_returnvalue(get_question::execute_returns(), $result);

        $this->assertSame($question->name, $result['name']);
        $this->assertSame('multichoice', $result['qtype']);
        $this->assertNotEmpty($result['answers']);
        $this->assertGreaterThanOrEqual(0, $result['correctindex']);
    }

    /**
     * Fall ohne Berechtigung: local/kurspilot:use fehlt trotz Einschreibung.
     */
    public function test_rejects_user_without_capability(): void {
        $this->resetAfterTest();

        [$course, $category] = $this->create_course_with_question_category();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $roleid = $this->get_role_id('editingteacher');
        assign_capability(
            'local/kurspilot:use',
            CAP_PROHIBIT,
            $roleid,
            \context_course::instance($course->id)->id,
            true
        );
        $this->setUser($teacher);

        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $question = $questiongenerator->create_question('multichoice', null, ['category' => $category->id]);

        $this->expectException(\required_capability_exception::class);

        get_question::execute((int) $category->id, $question->name);
    }

    /**
     * Fall ohne Einschreibung: eine nicht eingeschriebene Person bekommt
     * keine Daten.
     */
    public function test_rejects_user_without_enrolment(): void {
        $this->resetAfterTest();

        [, $category] = $this->create_course_with_question_category();
        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $question = $questiongenerator->create_question('multichoice', null, ['category' => $category->id]);

        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);

        get_question::execute((int) $category->id, $question->name);
    }

    /**
     * @return array{0: \stdClass, 1: \stdClass}
     */
    private function create_course_with_question_category(): array {
        $course = $this->getDataGenerator()->create_course();
        $qbank = $this->getDataGenerator()->create_module('qbank', ['course' => $course->id]);
        $qbankcontext = \context_module::instance($qbank->cmid);
        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $category = $questiongenerator->create_question_category(['contextid' => $qbankcontext->id]);
        return [$course, $category];
    }

    /**
     * @param string $shortname
     * @return int
     */
    private function get_role_id(string $shortname): int {
        global $DB;
        return (int) $DB->get_field('role', 'id', ['shortname' => $shortname], MUST_EXIST);
    }
}
