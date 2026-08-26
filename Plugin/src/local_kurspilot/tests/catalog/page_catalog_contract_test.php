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
 * Katalog-gegen-Moodle-Vertragstest fuer mod_page (Ticket #380, Vorbild
 * label_catalog_contract_test.php aus #379).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(page::class)]
final class page_catalog_contract_test extends \advanced_testcase {

    /**
     * Jede von page gefuehrte Datenbankspalte (Felder + modulspezifische
     * Sperrliste + die durchgaengig gesperrten, sofern in dieser Tabelle
     * vorhanden) plus "id" muss die reale Spaltenmenge von {page} exakt
     * ergeben.
     */
    public function test_page_table_columns_match_the_catalog(): void {
        global $DB;

        $this->resetAfterTest();

        $realcolumns = array_keys($DB->get_columns('page'));
        sort($realcolumns);

        $known = array_merge(
            ['id'],
            array_map(static fn (field $f): string => $f->name, page::fields()),
            page::blocklist(),
            array_intersect(shared_block::BLOCKLIST, $realcolumns)
        );
        sort($known);

        $this->assertSame(
            $realcolumns,
            array_values(array_unique($known)),
            "Die Spalten der Tabelle 'page' und der Feldkatalog (page::fields()/blocklist()) sind "
                . 'auseinandergelaufen - Moodle hat vermutlich eine Spalte hinzugefuegt, entfernt oder umbenannt.'
        );
    }

    /**
     * "printheading" existiert in Moodle 5.0 nicht mehr und darf im Katalog
     * nicht auftauchen (Ticket #380).
     */
    public function test_printheading_is_absent(): void {
        $names = array_column(
            array_map(static fn (field $f): array => $f->to_array(), array_merge(page::fields(), page::pseudofields())),
            'name'
        );
        $this->assertNotContains('printheading', $names);
    }

    /**
     * "display" ist eine echte Spalte - nicht das in Spec 0015 §2.2 genannte
     * Pseudofeld. Ein Regressionswaechter gegen den irrtuemlichen Rueckbau.
     */
    public function test_display_is_a_real_field_not_a_pseudofield(): void {
        $fieldnames = array_map(static fn (field $f): string => $f->name, page::fields());
        $pseudonames = array_map(static fn (field $f): string => $f->name, page::pseudofields());

        $this->assertContains('display', $fieldnames);
        $this->assertNotContains('display', $pseudonames);
    }

    /**
     * Jede referenzierte aufrufbare Quelle existiert wirklich.
     */
    public function test_referenced_callable_sources_exist(): void {
        global $CFG;
        require_once($CFG->libdir . '/resourcelib.php');

        $fields = array_merge(shared_block::fields(), shared_block::pseudofields(), page::fields(), page::pseudofields());

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

    /**
     * Die referenzierten RESOURCELIB_DISPLAY_*-Konstanten existieren noch.
     */
    public function test_resourcelib_display_constants_exist(): void {
        global $CFG;
        require_once($CFG->libdir . '/resourcelib.php');

        $this->assertTrue(defined('RESOURCELIB_DISPLAY_POPUP'));
        $this->assertSame(6, RESOURCELIB_DISPLAY_POPUP);
    }
}
