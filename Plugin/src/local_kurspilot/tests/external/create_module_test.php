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
use local_kurspilot\catalog\choice;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Der zweite Schreibvorgang (Spec 0015 §3.4, Ticket #389).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(create_module::class)]
final class create_module_test extends \advanced_testcase {

    /**
     * @return array{0: \stdClass, 1: \stdClass} Kurs, Lehrkraft (editingteacher).
     */
    private function course_with_editing_teacher(): array {
        $course = $this->getDataGenerator()->create_course();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);
        return [$course, $teacher];
    }

    /**
     * @param int $courseid
     * @param int $sectionnum
     * @param string $modname
     * @param array $felder
     * @return array
     */
    private function create(int $courseid, int $sectionnum, string $modname, array $felder): array {
        return external_api::clean_returnvalue(
            create_module::execute_returns(),
            create_module::execute($courseid, $sectionnum, $modname, json_encode($felder))
        );
    }

    /**
     * Simuliert, was die KI vor dem Aufruf selbst tut (Spec 0015 §2.4:
     * Feldbuendel sind kein Endpunkt-Parameter): Buendelwerte zuerst, die
     * ausdruecklich genannten Felder ueberschreiben sie.
     *
     * @param array $bundle
     * @param array $felder
     * @return array
     */
    private function merge_bundle(array $bundle, array $felder): array {
        return array_merge($bundle, $felder);
    }

    /**
     * @param int $cmid
     * @return array Ist-Stand, dieselbe Form wie get_module_settings.
     */
    private function read(int $cmid): array {
        $result = external_api::clean_returnvalue(
            get_module_settings::execute_returns(),
            get_module_settings::execute($cmid)
        );
        return json_decode($result['settings_json'], true);
    }

    /**
     * Die Anlegemeldung zitiert den gesetzten Wert woertlich - bei einem
     * Textfeld also HTML. Als PARAM_TEXT deklariert liess das jeden Aufruf
     * am Rueckgabewert scheitern ("Ungueltiger Rueckgabewert"), obwohl die
     * Aktivitaet bereits angelegt war (#400).
     */
    public function test_message_may_quote_html_content(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'label', [
            'intro' => '<p>Einstieg <strong>fett</strong></p>',
        ]);

        $this->assertStringContainsString('<p>Einstieg <strong>fett', $result['meldung']);
    }

    /**
     * Eine Aufgabe ohne genannte Abgabe-Einstellungen bekommt trotzdem
     * aktive Abgabemoeglichkeiten - der Formular-Default (admin-konfigurierbar,
     * ueblicherweise "Datei-Abgabe" aktiv) statt eines stillen "alles aus".
     */
    public function test_assign_without_submission_settings_gets_active_submissions(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'assign', [
            'name' => 'Hausaufgabe',
            'intro' => 'Beschreibung',
        ]);

        $after = $this->read($result['cmid']);
        $this->assertEquals(0, $after['nosubmissions'], 'nosubmissions muss 0 sein - mindestens eine Abgabeart aktiv.');
    }

    /**
     * Ein externer Link mit genannten Parametern behaelt sie beim Anlegen -
     * das Auffuellen fehlender Felder darf gegebene parameter_N/variable_N
     * nicht verwerfen.
     */
    public function test_url_keeps_given_parameters(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'url', [
            'name' => 'Externer Link',
            'externalurl' => 'https://example.org/',
            'parameter_0' => 'id',
            'variable_0' => 'userid',
        ]);

        $after = $this->read($result['cmid']);
        $this->assertSame(['id' => 'userid'], unserialize($after['parameters']));
    }

    /**
     * "resource" scheitert mit der auf Spec 0018 verweisenden Meldung und dem
     * Handweg-Hinweis; "folder" bleibt anlegbar (leer ist gueltig).
     */
    public function test_resource_is_blocked_but_folder_is_creatable(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        try {
            $this->create($course->id, 0, 'resource', ['name' => 'Datei']);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('Spec 0018', $e->getMessage());
            $this->assertStringContainsString('update_module_settings', $e->getMessage());
        }

        $result = $this->create($course->id, 0, 'folder', ['name' => 'Materialordner']);
        $this->assertSame('folder', $result['modname']);
        $this->assertGreaterThan(0, $result['cmid']);
    }

    /**
     * Eine Abstimmung mit 30 Optionen (Geraete-Zuteilung) laesst sich anlegen -
     * keine erfundene Obergrenze.
     */
    public function test_choice_with_thirty_options_can_be_created(): void {
        global $DB;
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $options = array_map(static fn (int $i): string => "Geraet $i", range(1, 30));

        $result = $this->create($course->id, 0, 'choice', [
            'name' => 'Geraete-Zuteilung',
            'intro' => 'Bitte waehlen',
            'option' => $options,
        ]);

        $cm = get_coursemodule_from_id('choice', $result['cmid'], 0, false, MUST_EXIST);
        $this->assertEquals(30, $DB->count_records('choice_options', ['choiceid' => $cm->instance]));
    }

    /**
     * Eine Begrenzungsliste falscher Laenge scheitert.
     */
    public function test_choice_with_mismatched_limit_length_fails(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        try {
            $this->create($course->id, 0, 'choice', [
                'name' => 'Abstimmung',
                'intro' => 'Bitte waehlen',
                'option' => ['A', 'B', 'C'],
                'limit' => [1, 2],
            ]);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('limit', $e->getMessage());
            $this->assertStringContainsString('option', $e->getMessage());
        }
    }

    /**
     * Das Feldbuendel "zuteilung" erzeugt die sechs dokumentierten
     * Einstellungen.
     */
    public function test_choice_zuteilung_bundle_sets_documented_fields(): void {
        global $DB;
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'choice', $this->merge_bundle(choice::bundles()['zuteilung'], [
            'name' => 'Geraete-Zuteilung',
            'intro' => 'Bitte waehlen',
            'option' => ['Tablet 1', 'Tablet 2'],
        ]));

        $after = $this->read($result['cmid']);
        $this->assertEquals(1, $after['limitanswers']);
        $this->assertEquals(1, $after['publish']);
        $this->assertEquals(3, $after['showresults']);
        $this->assertEquals(1, $after['display']);
        $this->assertEquals(1, $after['allowupdate']);

        $cm = get_coursemodule_from_id('choice', $result['cmid'], 0, false, MUST_EXIST);
        $maxanswers = $DB->get_fieldset_select('choice_options', 'maxanswers', 'choiceid = ?', [$cm->instance]);
        $this->assertSame([1, 1], array_map('intval', $maxanswers));
    }

    /**
     * Ein ausdruecklich genanntes Feld schlaegt das Buendel - ein Buendel
     * belegt nur vor, es ueberstimmt nichts.
     */
    public function test_explicit_field_beats_bundle(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'choice', $this->merge_bundle(choice::bundles()['zuteilung'], [
            'name' => 'Geraete-Zuteilung',
            'intro' => 'Bitte waehlen',
            'option' => ['Tablet 1', 'Tablet 2'],
            'allowupdate' => 0,
        ]));

        $after = $this->read($result['cmid']);
        $this->assertEquals(0, $after['allowupdate']);
        // Die uebrigen Buendelfelder bleiben gesetzt.
        $this->assertEquals(1, $after['limitanswers']);
    }

    /**
     * Ein Pflichtfeld ohne Formular-Default (hier: "name" bei mod_page) fuehrt
     * zu einem Fehler, der das Feld nennt.
     */
    public function test_required_field_without_default_fails(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        try {
            $this->create($course->id, 0, 'page', [
                'page' => ['text' => 'Inhalt', 'format' => FORMAT_HTML, 'itemid' => 0],
            ]);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('name', $e->getMessage());
        }
    }

    /**
     * Eine Textseite entsteht aus Name und Pseudofeld "page" allein.
     *
     * "content" war zusaetzlich als Pflichtfeld gefuehrt, obwohl es aus "page"
     * gesetzt wird - das ergab eine Sackgasse: "content" nennen forderte
     * "page", "page" nennen forderte "content" (#404).
     */
    public function test_page_needs_only_the_editor_pseudofield(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'page', [
            'name' => 'Textseite 1',
            'page' => ['text' => '<p>Alpha</p>', 'format' => FORMAT_HTML, 'itemid' => 0],
        ]);

        $after = $this->read($result['cmid']);
        $this->assertSame('<p>Alpha</p>', $after['content']);
    }

    /**
     * Fehlen mehrere Pflichtfelder ohne Formular-Default, nennt die Meldung
     * alle auf einmal - sonst raet sich der Aufrufer Aufruf fuer Aufruf durch
     * (#404).
     */
    public function test_all_missing_required_fields_are_named_at_once(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        try {
            $this->create($course->id, 0, 'page', []);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('name', $e->getMessage());
            $this->assertStringContainsString('page', $e->getMessage());
        }
    }

    /**
     * Lese-Vokabular der Lese-Werkzeuge ("coursepagevisibility") ist kein
     * Schreibfeld - die Meldung sagt das und nennt den Schreibweg, statt das
     * Feld als unbekannt abzutun (#404).
     */
    public function test_read_only_vocabulary_points_to_the_writable_field(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        try {
            $this->create($course->id, 0, 'label', [
                'intro' => 'Text',
                'coursepagevisibility' => 'stealth',
            ]);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('coursepagevisibility', $e->getMessage());
            $this->assertStringContainsString('visibleoncoursepage', $e->getMessage());
            $this->assertStringNotContainsString('Unbekanntes Feld', $e->getMessage());
        }
    }

    /**
     * Eine verletzte Datumspaar-Kombinationsregel scheitert auch beim Anlegen
     * (Spec 0015 §3.6 gilt fuer beide Schreibwege) - nichts wird angelegt.
     */
    public function test_combination_rule_violation_fails_and_creates_nothing(): void {
        global $DB;
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        try {
            $this->create($course->id, 0, 'forum', [
                'name' => 'Ankuendigungen',
                'intro' => 'Wichtige Hinweise',
                // cutoffdate liegt vor duedate - verletzt die Kombinationsregel.
                'duedate' => 2000000000,
                'cutoffdate' => 1000000000,
            ]);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('cutoffdate', $e->getMessage());
            $this->assertStringContainsString('duedate', $e->getMessage());
        }

        $this->assertEquals(0, $DB->count_records('forum', ['course' => $course->id]));
    }

    /**
     * Textseite, Textfeld, externer Link, Aufgabe, Abstimmung und Forum
     * lassen sich nacheinander in einen bestehenden Kurs schreiben.
     */
    public function test_all_catalogued_types_can_be_created_in_sequence(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->create($course->id, 0, 'page', [
            'name' => 'Textseite',
            'page' => ['text' => 'Seiteninhalt', 'format' => FORMAT_HTML, 'itemid' => 0],
        ]);
        $this->assertGreaterThan(0, $page['cmid']);

        $label = $this->create($course->id, 0, 'label', [
            'intro' => 'Textfeld-Inhalt',
        ]);
        $this->assertGreaterThan(0, $label['cmid']);

        $url = $this->create($course->id, 0, 'url', [
            'name' => 'Externer Link',
            'externalurl' => 'https://example.org/',
        ]);
        $this->assertGreaterThan(0, $url['cmid']);

        $assign = $this->create($course->id, 0, 'assign', [
            'name' => 'Aufgabe',
            'intro' => 'Aufgabenstellung',
        ]);
        $this->assertGreaterThan(0, $assign['cmid']);

        $choice = $this->create($course->id, 0, 'choice', [
            'name' => 'Abstimmung',
            'intro' => 'Bitte waehlen',
            'option' => ['Ja', 'Nein'],
        ]);
        $this->assertGreaterThan(0, $choice['cmid']);

        $forum = $this->create($course->id, 0, 'forum', [
            'name' => 'Forum',
            'intro' => 'Diskussion',
        ]);
        $this->assertGreaterThan(0, $forum['cmid']);
    }

    /**
     * Die Antwort ist die Anlegemeldung in Lehrkraft-Deutsch inklusive
     * Nebenwirkungen (forcesubscribe=2 abonniert sofort alle Teilnehmenden).
     */
    public function test_response_is_the_creation_message_including_side_effects(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'forum', [
            'name' => 'Ankuendigungen',
            'intro' => 'Wichtige Hinweise',
            'forcesubscribe' => 2,
        ]);

        $this->assertStringContainsString('Ankuendigungen', $result['meldung']);
        $this->assertNotEmpty($result['nebenwirkungen']);
        $this->assertStringContainsString('Kursteilnehmenden', $result['nebenwirkungen'][0]);
        $this->assertStringContainsString('Kursteilnehmenden', $result['meldung']);
    }

    /**
     * Schreiben im fremden Kurs ohne native Bearbeiten-Berechtigung scheitert
     * mit klarer Meldung.
     */
    public function test_create_without_native_capability_fails(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();

        $nonedit = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($nonedit->id, $course->id, 'teacher');
        $this->setUser($nonedit);

        $this->expectException(\required_capability_exception::class);
        create_module::execute($course->id, 0, 'page', json_encode([
            'name' => 'Textseite',
            'page' => ['text' => 'x', 'format' => FORMAT_HTML, 'itemid' => 0],
        ]));
    }

    /**
     * Jedes Anlegen erzeugt Version 1 im Aenderungsverlauf (course_module_created
     * wird ueber add_moduleinfo() nativ ausgeloest und beobachtet, #385).
     */
    public function test_create_produces_a_history_version(): void {
        global $DB;
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'label', ['intro' => 'Textfeld']);

        $version = $DB->get_record('local_kurspilot_cm_version', ['cmid' => $result['cmid'], 'version' => 1]);
        $this->assertNotFalse($version);
    }

    /**
     * Keine direkte DB-Schreibung auf einer Instanztabelle (ADR 0016) - der
     * einzige Schreibweg ist add_moduleinfo().
     */
    public function test_source_never_writes_the_instance_table_directly(): void {
        $source = file_get_contents(__DIR__ . '/../../classes/external/create_module.php');
        $this->assertStringNotContainsString('$DB->update_record', $source);
        $this->assertStringNotContainsString('$DB->insert_record', $source);
        $this->assertStringContainsString('add_moduleinfo(', $source);
    }

    /**
     * Eine Aktivitaet kann gleich beim Anlegen stealth (visibleoncoursepage=0)
     * gestellt werden, wenn allowstealth an ist - idnumber wird ebenfalls
     * uebernommen (Ticket #390).
     */
    public function test_stealth_and_idnumber_can_be_set_on_create(): void {
        $this->resetAfterTest();
        set_config('allowstealth', 1);
        [$course] = $this->course_with_editing_teacher();

        $result = $this->create($course->id, 0, 'page', [
            'name' => 'Versteckte Seite',
            'page' => ['text' => 'Inhalt', 'format' => FORMAT_HTML, 'itemid' => 0],
            'visibleoncoursepage' => 0,
            'idnumber' => 'kp-390-create',
        ]);

        $after = $this->read($result['cmid']);
        $this->assertSame(0, $after['visibleoncoursepage']);
        $this->assertSame('stealth', $after['coursepagevisibility']);
        $this->assertSame('kp-390-create', $after['idnumber']);
    }

    /**
     * Bei abgeschaltetem allowstealth scheitert das Anlegen mit
     * visibleoncoursepage=0, es wird nichts angelegt (Ticket #390).
     */
    public function test_stealth_on_create_fails_with_clear_message_when_allowstealth_is_off(): void {
        global $DB;
        $this->resetAfterTest();
        set_config('allowstealth', 0);
        [$course] = $this->course_with_editing_teacher();

        $before = $DB->count_records('page', ['course' => $course->id]);

        try {
            $this->create($course->id, 0, 'page', [
                'name' => 'x',
                'page' => ['text' => 'Inhalt', 'format' => FORMAT_HTML, 'itemid' => 0],
                'visibleoncoursepage' => 0,
            ]);
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('allowstealth', $e->getMessage());
        }

        $this->assertSame($before, $DB->count_records('page', ['course' => $course->id]));
    }

    /**
     * Abnahmekriterium #399: Drift sperrt nur die betroffene Aktivitätsart -
     * "folder" bleibt anlegbar, waehrend "page" wegen simulierter
     * Katalogabweichung gesperrt ist.
     */
    public function test_drift_blocks_only_the_affected_activity_type(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        \local_kurspilot\write_gate::all_statuses();
        set_config('driftviolations_page', json_encode(['Spalte "intro" fehlt.']), 'local_kurspilot');

        try {
            $this->create($course->id, 0, 'page', [
                'name' => 'x',
                'page' => ['text' => 'Inhalt', 'format' => FORMAT_HTML, 'itemid' => 0],
            ]);
            $this->fail('execute() haette wegen Drift werfen muessen.');
        } catch (\moodle_exception $e) {
            // Die genaue deutsche Formulierung wird in write_gate_test.php
            // gegen das Sprachpaket geprueft.
            $this->assertSame('modnamedriftlocked', $e->errorcode);
        }

        // "folder" bleibt anlegbar - nur "page" ist gesperrt.
        $this->create($course->id, 0, 'folder', ['name' => 'x']);
        $this->addToAssertionCount(1);
    }
}
