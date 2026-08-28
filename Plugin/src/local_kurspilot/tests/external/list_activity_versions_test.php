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
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Mehrversionen-Ueberblick des Aenderungsverlaufs (Spec 0015 §10.6, #394).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(list_activity_versions::class)]
final class list_activity_versions_test extends \advanced_testcase {

    /**
     * @return array{0: \stdClass, 1: \stdClass}
     */
    private function create_page(): array {
        $course = $this->getDataGenerator()->create_course();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);
        $cm = get_coursemodule_from_instance('page', $page->id, $course->id, false, MUST_EXIST);

        return [$course, $cm];
    }

    /**
     * Abnahmekriterium 6: eine editierende Lehrkraft mit der Standard-
     * Rollenzuweisung darf lesen (Archetyp-Voreinstellung von
     * local/kurspilot:viewhistory).
     */
    public function test_returns_versions_for_teacher(): void {
        $this->resetAfterTest();
        [, $cm] = $this->create_page();

        $result = list_activity_versions::execute($cm->id);
        $result = external_api::clean_returnvalue(list_activity_versions::execute_returns(), $result);

        $this->assertSame((int) $cm->id, $result['cmid']);
        $this->assertSame('page', $result['modname']);
        $this->assertCount(1, $result['versionen']);
        $this->assertNotEmpty($result['hinweis_luecken']);
    }

    /**
     * Abnahmekriterium 6: local/kurspilot:viewhistory wird geprueft - ohne
     * sie wird abgewiesen.
     */
    public function test_rejects_user_without_capability(): void {
        $this->resetAfterTest();
        [$course, $cm] = $this->create_page();

        $roleid = (int) $this->get_role_id('editingteacher');
        assign_capability(
            'local/kurspilot:viewhistory',
            CAP_PROHIBIT,
            $roleid,
            \context_course::instance($course->id)->id,
            true
        );

        $this->expectException(\required_capability_exception::class);
        list_activity_versions::execute($cm->id);
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
