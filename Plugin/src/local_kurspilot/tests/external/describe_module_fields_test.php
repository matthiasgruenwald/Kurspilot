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
 * Feldkatalog-Abruf (#379): Katalog-Gerüst, gemeinsamer Block, label als
 * erste vollständig katalogisierte Aktivitätsart.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(describe_module_fields::class)]
final class describe_module_fields_test extends \advanced_testcase {

    /**
     * Ohne modname: die von Kurspilot geführten Aktivitätsarten (User Story 13).
     */
    public function test_without_modname_lists_known_activity_types(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = describe_module_fields::execute();
        $result = external_api::clean_returnvalue(describe_module_fields::execute_returns(), $result);

        $this->assertContains('label', $result['aktivitaetsarten']);
        $this->assertNull($result['modul']);
        $this->assertNotSame('', trim($result['hinweis']));
    }

    /**
     * Kurzform: Felder und Feldbündel ja, die restlichen vier Kategorien
     * nein - dafür ein ausdrücklicher Hinweis, dass es mehr gibt.
     */
    public function test_short_form_omits_extra_categories_and_says_so(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = describe_module_fields::execute('label');
        $result = external_api::clean_returnvalue(describe_module_fields::execute_returns(), $result);

        $this->assertNotEmpty($result['modul']['felder']);
        $this->assertSame([], $result['modul']['pseudofelder']);
        $this->assertSame([], $result['modul']['sperrliste']);
        $this->assertSame([], $result['modul']['kombinationsregeln']);
        $this->assertSame([], $result['modul']['nebenwirkungen']);
        $this->assertStringContainsString('vollstaendig', $result['hinweis']);
    }

    /**
     * Vollständige Form: alle fünf Kategorien, unterscheidbar von der Kurzform.
     */
    public function test_full_form_includes_all_five_categories(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $short = external_api::clean_returnvalue(
            describe_module_fields::execute_returns(),
            describe_module_fields::execute('label', false)
        );
        $full = external_api::clean_returnvalue(
            describe_module_fields::execute_returns(),
            describe_module_fields::execute('label', true)
        );

        $this->assertNotEquals($short, $full, 'Kurzform und vollständige Form müssen sich unterscheiden.');

        $sperrliste = $full['modul']['sperrliste'];
        $this->assertContains('name', $sperrliste, 'label.name muss gesperrt sein - es wird aus dem Intro abgeleitet.');
        $this->assertContains('course', $sperrliste);
        $this->assertContains('timemodified', $sperrliste);

        $pseudonames = array_column($full['modul']['pseudofelder'], 'name');
        $this->assertContains('coursepagevisibility', $pseudonames);
    }

    /**
     * Der gemeinsame Block erscheint bei label und ist nicht in der
     * label-Klasse dupliziert - geprüft über die Ausgabe, nicht die
     * Implementierung: die Feldliste enthält sowohl label-eigene als auch
     * course_modules-Felder.
     */
    public function test_shared_block_appears_alongside_label_fields(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = external_api::clean_returnvalue(
            describe_module_fields::execute_returns(),
            describe_module_fields::execute('label', true)
        );

        $names = array_column($result['modul']['felder'], 'name');
        $this->assertContains('intro', $names, 'label-eigenes Feld fehlt.');
        $this->assertContains('visible', $names, 'Gemeinsamer Block fehlt.');
        $this->assertContains('groupmode', $names, 'Gemeinsamer Block fehlt.');
        $this->assertContains('idnumber', $names, 'Gemeinsamer Block fehlt.');

        // Keine Dopplung: jeder Feldname erscheint genau einmal.
        $this->assertSame(count($names), count(array_unique($names)), 'Ein Feld ist dupliziert.');
    }

    /**
     * Jedes Katalogfeld trägt eine deutsche Bedeutung - kein Feld wird nur
     * mit englischem Namen ausgeliefert.
     */
    public function test_every_field_carries_a_german_meaning(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = external_api::clean_returnvalue(
            describe_module_fields::execute_returns(),
            describe_module_fields::execute('label', true)
        );

        $allfields = array_merge($result['modul']['felder'], $result['modul']['pseudofelder']);
        $this->assertNotEmpty($allfields);
        foreach ($allfields as $field) {
            $this->assertNotSame('', trim($field['bedeutung']), $field['name'] . ' hat keine deutsche Bedeutung.');
        }
    }

    /**
     * Unbekannte Aktivitätsart scheitert mit einer Meldung, die die
     * geführten Arten nennt.
     */
    public function test_unknown_modname_throws(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        describe_module_fields::execute('quiz');
    }

    /**
     * Rein lesend: der Aufruf führt zu keiner neuen Kurspilot-Capability.
     */
    public function test_introduces_no_write_capability(): void {
        global $DB;

        $this->resetAfterTest();

        $names = $DB->get_fieldset_select('capabilities', 'name', 'component = :component', ['component' => 'local_kurspilot']);
        sort($names);

        $this->assertSame(['local/kurspilot:use', 'local/kurspilot:useremote'], $names);
    }
}
