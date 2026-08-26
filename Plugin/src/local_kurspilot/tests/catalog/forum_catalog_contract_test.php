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
 * Katalog-gegen-Moodle-Vertragstest fuer mod_forum (Ticket #381, Vorbild
 * resource_catalog_contract_test.php aus #380).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(forum::class)]
final class forum_catalog_contract_test extends \advanced_testcase {

    /**
     * Jede von forum gefuehrte Datenbankspalte muss die reale Spaltenmenge
     * von {forum} exakt ergeben. "assesstimestart"/"assesstimefinish" sind
     * echte Spalten, stehen aber auf der Sperrliste (siehe
     * test_ratingtime_pseudofield_and_assesstime_blocklist) - deshalb ganz
     * normal ueber choice::blocklist() mitgezaehlt, nicht herausgerechnet.
     */
    public function test_forum_table_columns_match_the_catalog(): void {
        global $DB;

        $this->resetAfterTest();

        $realcolumns = array_keys($DB->get_columns('forum'));
        sort($realcolumns);

        $known = array_merge(
            ['id'],
            array_map(static fn (field $f): string => $f->name, forum::fields()),
            forum::blocklist(),
            array_intersect(shared_block::BLOCKLIST, $realcolumns)
        );
        sort($known);

        $this->assertSame(
            $realcolumns,
            array_values(array_unique($known)),
            "Die Spalten der Tabelle 'forum' und der Feldkatalog (forum::fields()/blocklist()) sind "
                . 'auseinandergelaufen - Moodle hat vermutlich eine Spalte hinzugefuegt, entfernt oder umbenannt.'
        );
    }

    /**
     * Jede referenzierte aufrufbare Quelle existiert wirklich - inklusive der
     * Klassenmethode rating_manager::get_aggregate_types() (Abnahmekriterium
     * #381: "referenziert die drei aufrufbaren Quellen statt sie
     * abzuschreiben").
     */
    public function test_referenced_callable_sources_exist(): void {
        global $CFG;
        require_once($CFG->dirroot . '/mod/forum/lib.php');
        require_once($CFG->dirroot . '/rating/lib.php');

        $fields = array_merge(
            shared_block::fields(),
            shared_block::pseudofields(),
            forum::fields(),
            forum::pseudofields()
        );

        $callables = array_filter(array_map(
            static fn (field $f): ?string => $f->sourcecallable,
            $fields
        ));

        $this->assertNotEmpty($callables, 'Kein Feld referenziert eine aufrufbare Quelle - Testannahme verletzt.');
        $this->assertContains(
            'rating_manager::get_aggregate_types()',
            $callables,
            'assessed muss rating_manager::get_aggregate_types() referenzieren statt die Werte abzuschreiben.'
        );
        $this->assertContains('forum_get_forum_types()', $callables);
        $this->assertContains('forum_get_subscriptionmode_options()', $callables);

        foreach ($callables as $callable) {
            if (str_contains($callable, '::')) {
                [$classname, $methodname] = explode('::', rtrim($callable, '()'), 2);
                $this->assertTrue(
                    method_exists($classname, $methodname),
                    "Referenzierte aufrufbare Quelle $callable existiert auf dieser Instanz nicht mehr."
                );
                continue;
            }
            $functionname = rtrim($callable, '()');
            $this->assertTrue(
                function_exists($functionname),
                "Referenzierte aufrufbare Quelle $callable existiert auf dieser Instanz nicht mehr."
            );
        }
    }

    /**
     * Abnahmekriterium #381: "ratingtime" ist als Pseudofeld gefuehrt,
     * "assesstimestart"/"assesstimefinish" stehen auf der Sperrliste.
     */
    public function test_ratingtime_pseudofield_and_assesstime_blocklist(): void {
        $pseudonames = array_map(static fn (field $f): string => $f->name, forum::pseudofields());
        $this->assertContains('ratingtime', $pseudonames);

        $this->assertContains('assesstimestart', forum::blocklist());
        $this->assertContains('assesstimefinish', forum::blocklist());
    }

    /**
     * Abnahmekriterium #381: "forcesubscribe = 2" traegt einen
     * Nebenwirkungsvermerk in Lehrkraft-Deutsch, der die Mails an alle
     * Kursteilnehmenden ausspricht.
     */
    public function test_forcesubscribe_side_effect_notes_mass_mail(): void {
        $notes = implode(' ', forum::side_effects());
        $this->assertStringContainsString('forcesubscribe', $notes);
        $this->assertStringContainsString('Mail', $notes);
        $this->assertStringContainsString('alle', $notes);
        $this->assertStringContainsString('Kursteilnehmenden', $notes);
    }

    /**
     * Kalendereintrag als zweiter Nebenwirkungsvermerk (Ticket #381).
     */
    public function test_side_effects_note_calendar_entries(): void {
        $notes = implode(' ', forum::side_effects());
        $this->assertStringContainsString('Kalendereintrag', $notes);
    }

    /**
     * FORUM_INITIALSUBSCRIBE (Wert 2) existiert noch auf dieser Instanz.
     */
    public function test_forum_initialsubscribe_constant_exists(): void {
        global $CFG;
        require_once($CFG->dirroot . '/mod/forum/lib.php');

        $this->assertTrue(defined('FORUM_INITIALSUBSCRIBE'));
        $this->assertSame(2, FORUM_INITIALSUBSCRIBE);
    }
}
