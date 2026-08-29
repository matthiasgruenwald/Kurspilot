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

namespace local_kurspilot\check;

use core\check\result;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Die Admin-Statusprüfung je Aktivitätsart (Ticket #399): "geprueft" und
 * "automatisch_geprueft" sind beide result::OK (schreibbar), "braucht_arbeit"
 * ist result::ERROR (gesperrt) mit den Verstoessen als Detail.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(activity_drift::class)]
final class activity_drift_test extends \advanced_testcase {

    /**
     * Gruen auf der aktuellen Testinstanz -> result::OK.
     */
    public function test_result_is_ok_when_green(): void {
        $this->resetAfterTest();

        $check = new activity_drift('label');
        $result = $check->get_result();

        $this->assertSame(result::OK, $result->get_status());
    }

    /**
     * Simulierter Drift -> result::ERROR, Detail nennt den Verstoss.
     */
    public function test_result_is_error_when_drifted(): void {
        $this->resetAfterTest();

        \local_kurspilot\write_gate::all_statuses();
        set_config('driftviolations_label', json_encode(['Spalte "intro" fehlt.']), 'local_kurspilot');

        $check = new activity_drift('label');
        $result = $check->get_result();

        $this->assertSame(result::ERROR, $result->get_status());
        $this->assertStringContainsString('intro', $result->get_details());
    }

    /**
     * Die Check-ID ist je Aktivitätsart eindeutig.
     */
    public function test_id_is_unique_per_modname(): void {
        $this->assertNotSame((new activity_drift('label'))->get_id(), (new activity_drift('page'))->get_id());
    }
}
