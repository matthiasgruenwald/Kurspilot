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

namespace local_kurspilot\catalog;

use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Gemeinsame Vorbereitung des $moduleinfo-Feldobjekts ausserhalb des
 * Formularwegs (#388/#392/#400).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(pseudofield_carry_forward::class)]
final class pseudofield_carry_forward_test extends \advanced_testcase {

    /**
     * get_moduleinfo_data() liefert "gradepass" im Anzeigeformat der
     * eingestellten Sprache ("0,00" auf Deutsch). Zurueckgeschrieben muss es
     * wieder eine Zahl sein, sonst bricht der Schreibvorgang in der
     * Bewertungstabelle ab - nachdem die eigentliche Aenderung schon
     * persistiert ist (#400).
     */
    public function test_localised_gradepass_becomes_a_number(): void {
        $this->resetAfterTest();
        $moduleinfo = (object) [
            'gradepass' => format_float(12.5, 2),
            // Aktivitaetsarten mit mehreren Bewertungsspalten (workshop).
            'submissiongradepass' => format_float(7.0, 2),
            'name' => 'unberuehrt',
        ];

        pseudofield_carry_forward::unformat_localised_gradepass($moduleinfo);

        $this->assertSame(12.5, $moduleinfo->gradepass);
        $this->assertSame(7.0, $moduleinfo->submissiongradepass);
        $this->assertSame('unberuehrt', $moduleinfo->name);
    }

    /**
     * Ein leeres Feld bleibt leer - "keine Bestehensgrenze" ist keine 0.
     */
    public function test_empty_gradepass_is_left_alone(): void {
        $this->resetAfterTest();
        $moduleinfo = (object) ['gradepass' => ''];

        pseudofield_carry_forward::unformat_localised_gradepass($moduleinfo);

        $this->assertSame('', $moduleinfo->gradepass);
    }
}
