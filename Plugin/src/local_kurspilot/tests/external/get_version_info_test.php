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

defined('MOODLE_INTERNAL') || die();

/**
 * Versionsauskunft (#425 F3): Moodle- und Plugin-Version fuer den Kopf der
 * Fragetyp-Ablage, die Instanzpruefung (#340) und Support-Faelle.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(get_version_info::class)]
final class get_version_info_test extends \advanced_testcase {

    /**
     * Die Auskunft nennt Moodle-Release/-Version/-Branch sowie
     * $plugin->version und $plugin->release aus version.php - keine
     * Platzhalter, keine leeren Felder.
     */
    public function test_reports_moodle_and_plugin_versions(): void {
        global $CFG;

        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = get_version_info::execute();
        $result = external_api::clean_returnvalue(get_version_info::execute_returns(), $result);

        $plugin = new \stdClass();
        require($CFG->dirroot . '/local/kurspilot/version.php');

        $this->assertSame($CFG->release, $result['moodle_release']);
        $this->assertSame((string) $CFG->version, $result['moodle_version']);
        $this->assertSame((string) $CFG->branch, $result['moodle_branch']);
        $this->assertSame((int) $plugin->version, $result['plugin_version']);
        $this->assertSame($plugin->release, $result['plugin_release']);
    }

    /**
     * "datum" fuellt das Feld "zuletzt verifiziert am" der Fragetyp-Ablage -
     * Serverdatum als YYYY-MM-DD, kein Zeitstempel zum Nachformatieren.
     */
    public function test_datum_is_iso_date(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = get_version_info::execute();
        $result = external_api::clean_returnvalue(get_version_info::execute_returns(), $result);

        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $result['datum']);
    }

    /**
     * Die Meldung ist die Lehrkraft-lesbare Fassung derselben Angaben - sie
     * muss die Versionen im Klartext enthalten, sonst waere sie wertlos.
     */
    public function test_meldung_names_both_versions(): void {
        global $CFG;

        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = get_version_info::execute();
        $result = external_api::clean_returnvalue(get_version_info::execute_returns(), $result);

        $this->assertStringContainsString($CFG->release, $result['meldung']);
        $this->assertStringContainsString((string) $result['plugin_version'], $result['meldung']);
    }
}
