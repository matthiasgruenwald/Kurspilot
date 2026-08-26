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
 * Katalog-gegen-Moodle-Vertragstest fuer mod_resource (Ticket #380, Vorbild
 * label_catalog_contract_test.php aus #379).
 *
 * Prueft ausdruecklich nur die Tabelle "resource" (nicht "resource_old",
 * dem 1.9-Migrationsarchiv aus mod/resource/db/install.xml).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(resource::class)]
final class resource_catalog_contract_test extends \advanced_testcase {

    /**
     * Jede von resource gefuehrte Datenbankspalte muss die reale
     * Spaltenmenge von {resource} exakt ergeben. "files" steht auf der
     * Sperrliste, obwohl es kein DB-Feld ist (Dateifelder sind bis
     * Spec 0018 gesperrt) - deshalb aus der erwarteten Spaltenmenge
     * herausgerechnet.
     */
    public function test_resource_table_columns_match_the_catalog(): void {
        global $DB;

        $this->resetAfterTest();

        $realcolumns = array_keys($DB->get_columns('resource'));
        sort($realcolumns);

        $known = array_merge(
            ['id'],
            array_map(static fn (field $f): string => $f->name, resource::fields()),
            array_diff(resource::blocklist(), ['files']),
            array_intersect(shared_block::BLOCKLIST, $realcolumns)
        );
        sort($known);

        $this->assertSame(
            $realcolumns,
            array_values(array_unique($known)),
            "Die Spalten der Tabelle 'resource' und der Feldkatalog (resource::fields()/blocklist()) sind "
                . 'auseinandergelaufen - Moodle hat vermutlich eine Spalte hinzugefuegt, entfernt oder umbenannt.'
        );
    }

    /**
     * "files" ist vollstaendig katalogisiert (Pseudofeld) und zugleich bis
     * Spec 0018 gesperrt (Ticket #380).
     */
    public function test_files_is_catalogued_and_locked(): void {
        $pseudonames = array_map(static fn (field $f): string => $f->name, resource::pseudofields());

        $this->assertContains('files', $pseudonames, '"files" muss vollstaendig katalogisiert sein.');
        $this->assertContains('files', resource::blocklist(), '"files" muss bis Spec 0018 gesperrt sein.');
    }

    /**
     * resource bleibt anders als folder bis Spec 0018 nicht anlegbar (Spec
     * 0015 §4.3) - der Katalog vermerkt das ausdruecklich.
     */
    public function test_side_effects_note_resource_stays_not_creatable(): void {
        $notes = implode(' ', resource::side_effects());
        $this->assertStringContainsString('nicht anlegbar', $notes);
    }

    /**
     * "revision" und "displayoptions" stehen auf der Sperrliste (Ticket #380).
     */
    public function test_revision_and_displayoptions_are_blocked(): void {
        $this->assertContains('revision', resource::blocklist());
        $this->assertContains('displayoptions', resource::blocklist());
    }

    /**
     * Jede referenzierte aufrufbare Quelle existiert wirklich.
     */
    public function test_referenced_callable_sources_exist(): void {
        global $CFG;
        require_once($CFG->libdir . '/resourcelib.php');

        $fields = array_merge(
            shared_block::fields(),
            shared_block::pseudofields(),
            resource::fields(),
            resource::pseudofields()
        );

        $callables = array_filter(array_map(
            static fn (field $f): ?string => $f->sourcecallable,
            $fields
        ));

        $this->assertNotEmpty($callables, 'Kein Feld referenziert eine aufrufbare Quelle - Testannahme verletzt.');

        foreach ($callables as $callable) {
            $functionname = rtrim($callable, '()');
            $this->assertTrue(
                function_exists($functionname),
                "Referenzierte aufrufbare Quelle $callable existiert auf dieser Instanz nicht mehr."
            );
        }
    }
}
