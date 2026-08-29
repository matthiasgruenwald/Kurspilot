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

require_once(__DIR__ . '/../lib.php');

/**
 * local_kurspilot_extend_navigation_course() (#397): der Verlaufslink
 * erscheint in der Kursnavigation nur mit local/kurspilot:viewhistory.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class local_kurspilot_lib_test extends advanced_testcase {

    /**
     * @return array{0: stdClass, 1: context_course} Kurs, Kurskontext.
     */
    private function course(): array {
        $course = $this->getDataGenerator()->create_course();
        return [$course, context_course::instance($course->id)];
    }

    /**
     * Mit der Faehigkeit erscheint genau ein Navigationsknoten, der auf
     * history.php mit der Kurs-ID verlinkt.
     */
    public function test_adds_node_with_viewhistory_capability(): void {
        $this->resetAfterTest();
        [$course, $context] = $this->course();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);

        $navigation = new navigation_node('root');
        local_kurspilot_extend_navigation_course($navigation, $course, $context);

        $node = $navigation->get('local_kurspilot_history');
        $this->assertNotFalse($node);
        $this->assertStringContainsString('history.php', (string) $node->action);
        $this->assertStringContainsString('id=' . $course->id, (string) $node->action);
    }

    /**
     * Ohne die Faehigkeit (z.B. ein normaler Kursteilnehmer) bleibt die
     * Kursnavigation unveraendert - kein Link zu einer Seite, die
     * require_capability() ohnehin verweigern wuerde.
     */
    public function test_adds_no_node_without_viewhistory_capability(): void {
        $this->resetAfterTest();
        [$course, $context] = $this->course();
        $student = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($student->id, $course->id, 'student');
        $this->setUser($student);

        $navigation = new navigation_node('root');
        local_kurspilot_extend_navigation_course($navigation, $course, $context);

        $this->assertFalse($navigation->get('local_kurspilot_history'));
    }
}
