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

namespace local_kurspilot;

/**
 * Install-Smoke: das Plugin installiert sauber auf Moodle 5.0
 * (Abnahmekriterium 1 aus #309).
 *
 * Dass diese Tests ueberhaupt laufen, setzt eine erfolgreiche Installation
 * bereits voraus - geprueft wird hier, dass die Installation die Dinge
 * angelegt hat, auf denen alles Weitere aufsetzt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversNothing]
final class install_test extends \advanced_testcase {

    /**
     * Die Plugin-Version ist installiert und verlangt mindestens Moodle 5.0.
     */
    public function test_plugin_is_installed_and_requires_moodle_50(): void {
        global $CFG;

        $this->resetAfterTest();

        $installed = get_config('local_kurspilot', 'version');
        $this->assertNotFalse($installed, 'local_kurspilot ist nicht installiert.');

        $plugin = new \stdClass();
        require($CFG->dirroot . '/local/kurspilot/version.php');

        $this->assertSame('local_kurspilot', $plugin->component);
        $this->assertEquals($plugin->version, $installed);
        // 2025041400 ist der Versionsstempel von Moodle 5.0 (#300, Punkt 10).
        $this->assertGreaterThanOrEqual(2025041400, $plugin->requires);
    }

    /**
     * Beide Capabilities aus #296 sind registriert, jeweils im richtigen Kontext.
     */
    public function test_capabilities_are_registered(): void {
        global $DB;

        $this->resetAfterTest();

        $use = $DB->get_record('capabilities', ['name' => 'local/kurspilot:use']);
        $this->assertNotEmpty($use, 'local/kurspilot:use fehlt.');
        $this->assertEquals(CONTEXT_COURSE, $use->contextlevel);

        $remote = $DB->get_record('capabilities', ['name' => 'local/kurspilot:useremote']);
        $this->assertNotEmpty($remote, 'local/kurspilot:useremote fehlt.');
        $this->assertEquals(CONTEXT_SYSTEM, $remote->contextlevel);
    }

    /**
     * Der externe Dienst existiert und ist aktiviert.
     */
    public function test_external_service_is_registered(): void {
        global $DB;

        $this->resetAfterTest();

        $service = $DB->get_record('external_services', ['shortname' => privacy_surface::SERVICE_SHORTNAME]);
        $this->assertNotEmpty($service, 'Externer Dienst "kurspilot" fehlt.');
        $this->assertEquals(1, $service->enabled);
    }
}
