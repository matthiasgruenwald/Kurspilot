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
 * Katalog-gegen-Moodle-Vertragstest fuer mod_folder (Ticket #380, Vorbild
 * label_catalog_contract_test.php aus #379).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(folder::class)]
final class folder_catalog_contract_test extends \advanced_testcase {

    /**
     * Jede von folder gefuehrte Datenbankspalte muss die reale Spaltenmenge
     * von {folder} exakt ergeben. "files" steht auf der Sperrliste, obwohl es
     * kein DB-Feld ist (Dateifelder sind bis Spec 0018 gesperrt) - deshalb
     * aus der erwarteten Spaltenmenge herausgerechnet.
     */
    public function test_folder_table_columns_match_the_catalog(): void {
        global $DB;

        $this->resetAfterTest();

        $realcolumns = array_keys($DB->get_columns('folder'));
        sort($realcolumns);

        $known = array_merge(
            ['id'],
            array_map(static fn (field $f): string => $f->name, folder::fields()),
            array_diff(folder::blocklist(), ['files']),
            array_intersect(shared_block::BLOCKLIST, $realcolumns)
        );
        sort($known);

        $this->assertSame(
            $realcolumns,
            array_values(array_unique($known)),
            "Die Spalten der Tabelle 'folder' und der Feldkatalog (folder::fields()/blocklist()) sind "
                . 'auseinandergelaufen - Moodle hat vermutlich eine Spalte hinzugefuegt, entfernt oder umbenannt.'
        );
    }

    /**
     * "files" ist vollstaendig katalogisiert (Pseudofeld) und zugleich bis
     * Spec 0018 gesperrt (Ticket #380).
     */
    public function test_files_is_catalogued_and_locked(): void {
        $pseudonames = array_map(static fn (field $f): string => $f->name, folder::pseudofields());

        $this->assertContains('files', $pseudonames, '"files" muss vollstaendig katalogisiert sein.');
        $this->assertContains('files', folder::blocklist(), '"files" muss bis Spec 0018 gesperrt sein.');
    }

    /**
     * folder bleibt anders als resource anlegbar (Spec 0015 §4.3) - der
     * Katalog vermerkt das ausdruecklich.
     */
    public function test_side_effects_note_folder_stays_creatable(): void {
        $notes = implode(' ', folder::side_effects());
        $this->assertStringContainsString('anlegbar', $notes);
    }

    /**
     * Die FOLDER_DISPLAY_*-Konstanten existieren noch.
     */
    public function test_folder_display_constants_exist(): void {
        $this->assertTrue(defined('FOLDER_DISPLAY_PAGE'));
        $this->assertTrue(defined('FOLDER_DISPLAY_INLINE'));
        $this->assertSame([0, 1], [FOLDER_DISPLAY_PAGE, FOLDER_DISPLAY_INLINE]);
    }
}
