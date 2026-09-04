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

defined('MOODLE_INTERNAL') || die();

/**
 * Der Skill-Korpus-Katalog (Spec 0020 §4, Issue #450): ohne Kursbindung,
 * 'local/kurspilot:use' im Systemkontext genuegt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(list_skills::class)]
final class list_skills_test extends \advanced_testcase {

    /**
     * Nennt je Eintrag Name, Auslöser, Art und Umfang - keinen Inhalt, ohne
     * dass ein Kurs existiert oder die Lehrkraft in einem eingeschrieben ist.
     */
    public function test_lists_catalog_without_course_binding(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->role_assign('editingteacher', $user->id, \context_system::instance()->id);
        $this->setUser($user);

        $result = list_skills::execute();
        $result = external_api::clean_returnvalue(list_skills::execute_returns(), $result);

        $this->assertNotEmpty($result['skills']);
        $names = array_column($result['skills'], 'name');
        $this->assertContains('kurspilot', $names);
        $this->assertContains('kurspilot-core', $names);

        foreach ($result['skills'] as $skill) {
            $this->assertArrayNotHasKey('content', $skill);
            $this->assertContains($skill['art'], ['adapter', 'referenz']);
            $this->assertGreaterThan(0, $skill['umfang']);
        }
    }

    /**
     * Ohne 'local/kurspilot:use' im Systemkontext wird abgewiesen.
     */
    public function test_without_capability_is_rejected(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\required_capability_exception::class);
        list_skills::execute();
    }
}
