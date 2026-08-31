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
use local_kurspilot\catalog\registry;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Der erste Schreibvorgang (Spec 0015 §3.3, Ticket #388).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(update_module_settings::class)]
final class update_module_settings_test extends \advanced_testcase {

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
     * Ein Patch auf ein Feld aendert genau dieses Feld, nennt Vorher-/
     * Nachher-Wert, und laesst eine parallele Handaenderung an einem anderen
     * Feld unangetastet (Abnahmekriterien: Diff, Read-modify-write
     * unmittelbar vor dem Schreiben).
     */
    public function test_patch_changes_named_field_and_survives_concurrent_hand_edit(): void {
        global $DB;
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
            'name' => 'Alter Titel',
        ]);

        // Parallele Handaenderung an einem ANDEREN Feld, direkt vor dem
        // Schreibvorgang - muss ueberleben (Spec 0015 §3.3).
        $DB->set_field('page', 'intro', 'Handaenderung der Lehrkraft', ['id' => $page->id]);

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute($page->cmid, json_encode(['name' => 'Neuer Titel']))
        );

        $this->assertCount(1, $result['aenderungen']);
        $this->assertSame('name', $result['aenderungen'][0]['feld']);
        $this->assertSame('"Alter Titel"', $result['aenderungen'][0]['von_json']);
        $this->assertSame('"Neuer Titel"', $result['aenderungen'][0]['auf_json']);
        $this->assertStringContainsString('Alter Titel', $result['meldung']);
        $this->assertStringContainsString('Neuer Titel', $result['meldung']);

        $after = $this->read($page->cmid);
        $this->assertSame('Neuer Titel', $after['name']);
        $this->assertSame('Handaenderung der Lehrkraft', $after['intro']);
    }

    /**
     * Ein Patch, der den bestehenden Wert nur wiederholt, meldet keine
     * Aenderung.
     */
    public function test_patch_matching_current_value_reports_no_change(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
            'name' => 'Gleicher Titel',
        ]);

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute($page->cmid, json_encode(['name' => 'Gleicher Titel']))
        );

        $this->assertCount(0, $result['aenderungen']);
    }

    /**
     * Ein Patch, der den bestehenden Wert nur wiederholt, meldet auch in der
     * Meldung selbst keine Aenderung - nicht nur in "aenderungen".
     */
    public function test_patch_matching_current_value_says_so_in_the_message(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
            'name' => 'Gleicher Titel',
        ]);

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute($page->cmid, json_encode(['name' => 'Gleicher Titel']))
        );

        $this->assertStringContainsString('Keine Aenderung', $result['meldung']);
    }

    /**
     * Ein Pseudofeld hat keine Spalte in der Instanztabelle, der
     * Vorher/Nachher-Vergleich kann es also nicht sehen. Die Meldung darf
     * deshalb trotzdem nicht "Keine Aenderung" behaupten - geschrieben wurde
     * sehr wohl (#403).
     */
    public function test_written_pseudofield_is_named_in_the_message(): void {
        $this->resetAfterTest();
        global $DB;
        [$course] = $this->course_with_editing_teacher();
        $assign = $this->getDataGenerator()->get_plugin_generator('mod_assign')->create_instance([
            'course' => $course->id,
            'assignsubmission_file_enabled' => 0,
            'assignsubmission_onlinetext_enabled' => 0,
        ]);
        $cmid = (int) get_coursemodule_from_instance('assign', $assign->id)->id;

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute($cmid, json_encode(['assignsubmission_file_enabled' => 1]))
        );

        $this->assertStringNotContainsString('Keine Aenderung', $result['meldung']);
        $this->assertStringContainsString('assignsubmission_file_enabled', $result['meldung']);
        $this->assertEquals(1, $DB->get_field('assign_plugin_config', 'value', [
            'assignment' => $assign->id,
            'subtype' => 'assignsubmission',
            'plugin' => 'file',
            'name' => 'enabled',
        ]));
    }

    /**
     * Unbekannter Feldname scheitert, nichts wird geschrieben - die Meldung
     * nennt das Feld und verweist auf describe_module_fields.
     */
    public function test_unknown_field_fails_and_writes_nothing(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
            'name' => 'Unveraendert',
        ]);

        try {
            update_module_settings::execute($page->cmid, json_encode(['gibtsnicht' => 'x']));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('gibtsnicht', $e->getMessage());
            $this->assertStringContainsString('describe_module_fields', $e->getMessage());
        }

        $this->assertSame('Unveraendert', $this->read($page->cmid)['name']);
    }

    /**
     * Gesperrtes Feld (durchgaengige Sperrliste) scheitert ebenso.
     */
    public function test_blocked_field_fails_and_writes_nothing(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
            'name' => 'Unveraendert',
        ]);

        try {
            update_module_settings::execute($page->cmid, json_encode(['timemodified' => 123]));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('timemodified', $e->getMessage());
            $this->assertStringContainsString('describe_module_fields', $e->getMessage());
        }

        $this->assertSame('Unveraendert', $this->read($page->cmid)['name']);
    }

    /**
     * Unerlaubter Wert (ausserhalb des dokumentierten Wertebereichs)
     * scheitert ebenso.
     */
    public function test_invalid_value_fails_and_writes_nothing(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        try {
            update_module_settings::execute($page->cmid, json_encode(['visible' => 5]));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('visible', $e->getMessage());
            $this->assertStringContainsString('describe_module_fields', $e->getMessage());
        }

        $this->assertSame(1, $this->read($page->cmid)['visible']);
    }

    /**
     * Eine verletzte Kombinationsregel scheitert, ohne Teilstand.
     */
    public function test_combination_rule_violation_fails_and_writes_nothing(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $forum = $this->getDataGenerator()->get_plugin_generator('mod_forum')->create_instance([
            'course' => $course->id,
            'duedate' => 2000000000,
            'cutoffdate' => 0,
        ]);

        try {
            // cutoffdate liegt vor duedate - verletzt die Kombinationsregel.
            update_module_settings::execute($forum->cmid, json_encode(['cutoffdate' => 1000000000]));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('cutoffdate', $e->getMessage());
            $this->assertStringContainsString('duedate', $e->getMessage());
        }

        $this->assertEquals(0, $this->read($forum->cmid)['cutoffdate']);
    }

    /**
     * forcesubscribe=2 (Auto-Abonnement) wird als Nebenwirkung ausdruecklich
     * in der Antwort ausgesprochen (Spec 0015 §3.3, Katalogkategorie 5).
     */
    public function test_forum_forcesubscribe_side_effect_is_announced(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $forum = $this->getDataGenerator()->get_plugin_generator('mod_forum')->create_instance([
            'course' => $course->id,
            'forcesubscribe' => 0,
        ]);

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute($forum->cmid, json_encode(['forcesubscribe' => 2]))
        );

        $this->assertNotEmpty($result['nebenwirkungen']);
        $this->assertStringContainsString('Kursteilnehmenden', $result['nebenwirkungen'][0]);
        $this->assertStringContainsString('abonniert', $result['nebenwirkungen'][0]);
        $this->assertStringContainsString('Kursteilnehmenden', $result['meldung']);
    }

    /**
     * Ein Abschlussfeld im Patch scheitert (Sperrliste, course_modules-
     * completion*-Spalten).
     */
    public function test_completion_field_is_blocked(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        try {
            update_module_settings::execute($page->cmid, json_encode(['completionview' => 1]));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('completionview', $e->getMessage());
        }
    }

    /**
     * Aktivitaetsarten mit eigenem Schreibweg (quiz -> update_quiz_settings)
     * werden nicht ueber dieses Vehikel geschrieben.
     */
    public function test_modname_with_own_write_vehicle_is_rejected(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $quiz = $this->getDataGenerator()->get_plugin_generator('mod_quiz')->create_instance(['course' => $course->id]);

        try {
            update_module_settings::execute($quiz->cmid, json_encode(['name' => 'x']));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('update_quiz_settings', $e->getMessage());
        }
    }

    /**
     * Eine nicht von Kurspilot gefuehrte Aktivitaetsart scheitert mit
     * derselben Meldung wie describe_module_fields.
     */
    public function test_unknown_modname_is_rejected(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $wiki = $this->getDataGenerator()->get_plugin_generator('mod_wiki')->create_instance(['course' => $course->id]);

        try {
            update_module_settings::execute($wiki->cmid, json_encode(['name' => 'x']));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('wiki', $e->getMessage());
        }
    }

    /**
     * Schreiben im fremden Kurs ohne native Bearbeiten-Berechtigung
     * scheitert mit klarer Meldung, nicht still - lesend bleibt Kurspilot
     * weiter nutzbar (Spec 0015 §3.3).
     */
    public function test_write_without_native_capability_fails_but_read_still_works(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $editingteacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($editingteacher->id, $course->id, 'editingteacher');

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
            'name' => 'Fremder Kurs',
        ]);

        // Nicht-bearbeitende Lehrkraft: hat local/kurspilot:use, aber nicht
        // moodle/course:manageactivities.
        $nonedit = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($nonedit->id, $course->id, 'teacher');
        $this->setUser($nonedit);

        // Lesend bleibt nutzbar.
        $this->assertSame('Fremder Kurs', $this->read($page->cmid)['name']);

        $this->expectException(\required_capability_exception::class);
        update_module_settings::execute($page->cmid, json_encode(['name' => 'Uebernommen']));
    }

    /**
     * Der Schreibvorgang erzeugt einen Stand im Aenderungsverlauf (#385-387
     * beobachten course_module_updated automatisch).
     */
    public function test_write_creates_a_history_version(): void {
        global $DB;
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        // course_module_created hat bereits Version 1 angelegt (#385) - der
        // Schreibvorgang hier muss eine WEITERE Version hinzufuegen.
        $before = $DB->count_records('local_kurspilot_cm_version', ['cmid' => $page->cmid]);

        update_module_settings::execute($page->cmid, json_encode(['name' => 'Verlauf-Test']));

        $this->assertGreaterThan($before, $DB->count_records('local_kurspilot_cm_version', ['cmid' => $page->cmid]));
    }

    /**
     * Keine direkte DB-Schreibung auf einer Instanztabelle (ADR 0016) - der
     * einzige Schreibweg ist update_moduleinfo().
     */
    public function test_source_never_writes_the_instance_table_directly(): void {
        $source = file_get_contents(__DIR__ . '/../../classes/external/update_module_settings.php');
        $this->assertStringNotContainsString('$DB->update_record', $source);
        $this->assertStringNotContainsString('$DB->insert_record', $source);
        $this->assertStringContainsString('update_moduleinfo(', $source);
    }

    /**
     * Eine Aktivitaet laesst sich verbergen (visible=0) und wieder sichtbar
     * machen (visible=1) - Ticket #390, Abnahmekriterium 1.
     */
    public function test_visibility_can_be_hidden_and_shown_again(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        update_module_settings::execute($page->cmid, json_encode(['visible' => 0]));
        $this->assertSame(0, $this->read($page->cmid)['visible']);

        update_module_settings::execute($page->cmid, json_encode(['visible' => 1]));
        $this->assertSame(1, $this->read($page->cmid)['visible']);
    }

    /**
     * Stealth (visibleoncoursepage=0) funktioniert generisch fuer alle acht
     * vom Feldkatalog gefuehrten, ueber dieses Vehikel geschriebenen
     * Aktivitaetsarten (Ticket #390, Abnahmekriterium 2) - quiz hat einen
     * eigenen Schreibweg (update_quiz_settings) und ist deshalb nicht dabei.
     * "coursepagevisibility" (Lese-Vokabular) wechselt dabei ebenfalls auf
     * "stealth" - dasselbe Wort wie get_module_settings/get_course_catalog
     * (Abnahmekriterium: identische Feldnamen).
     */
    public function test_stealth_visibility_works_for_all_eight_activity_types(): void {
        $this->resetAfterTest();
        set_config('allowstealth', 1);
        [$course] = $this->course_with_editing_teacher();

        $modnames = registry::known_modnames();
        $this->assertContains('quiz', $modnames, 'quiz muss weiterhin katalogisiert sein (eigener Schreibweg).');
        $modnamesviaupdatemodulesettings = array_values(array_diff($modnames, ['quiz']));
        $this->assertCount(8, $modnamesviaupdatemodulesettings, 'Erwartet acht Aktivitaetsarten ueber dieses Vehikel.');

        foreach ($modnamesviaupdatemodulesettings as $modname) {
            $instance = $this->getDataGenerator()->get_plugin_generator('mod_' . $modname)->create_instance([
                'course' => $course->id,
            ]);

            $result = external_api::clean_returnvalue(
                update_module_settings::execute_returns(),
                update_module_settings::execute($instance->cmid, json_encode(['visibleoncoursepage' => 0]))
            );

            $after = $this->read($instance->cmid);
            $this->assertSame(0, $after['visibleoncoursepage'], "modname={$modname}");
            $this->assertSame('stealth', $after['coursepagevisibility'], "modname={$modname}");
            $this->assertStringContainsString('visibleoncoursepage', $result['meldung'], "modname={$modname}");
        }
    }

    /**
     * Bei abgeschaltetem allowstealth scheitert ein Stealth-Patch mit einer
     * klaren Meldung, es wird nichts geschrieben (Ticket #390,
     * Abnahmekriterium 3).
     */
    public function test_stealth_fails_with_clear_message_when_allowstealth_is_off(): void {
        $this->resetAfterTest();
        set_config('allowstealth', 0);
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        try {
            update_module_settings::execute($page->cmid, json_encode(['visibleoncoursepage' => 0]));
            $this->fail('Erwartete moodle_exception blieb aus.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('allowstealth', $e->getMessage());
        }

        $this->assertSame(1, $this->read($page->cmid)['visibleoncoursepage']);
    }

    /**
     * Trotz abgeschaltetem allowstealth bleiben visible (Verbergen im Kurs)
     * und die Rueckkehr auf visibleoncoursepage=1 uneingeschraenkt moeglich -
     * die Sperre trifft nur den Zielwert 0.
     */
    public function test_hiding_is_still_allowed_when_stealth_is_off(): void {
        $this->resetAfterTest();
        set_config('allowstealth', 0);
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        update_module_settings::execute($page->cmid, json_encode(['visible' => 0]));
        $this->assertSame(0, $this->read($page->cmid)['visible']);

        update_module_settings::execute($page->cmid, json_encode(['visibleoncoursepage' => 1]));
        $this->assertSame(1, $this->read($page->cmid)['visibleoncoursepage']);
    }

    /**
     * groupmode und groupingid lassen sich setzen, mit Vorher-/Nachher-
     * Meldung in Lehrkraft-Deutsch (Ticket #390, Abnahmekriterium 4/8).
     */
    public function test_groupmode_and_groupingid_can_be_set(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $grouping = $this->getDataGenerator()->create_grouping(['courseid' => $course->id]);
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute(
                $page->cmid,
                json_encode(['groupmode' => SEPARATEGROUPS, 'groupingid' => (int) $grouping->id])
            )
        );

        $after = $this->read($page->cmid);
        $this->assertSame(SEPARATEGROUPS, $after['groupmode']);
        $this->assertSame((int) $grouping->id, $after['groupingid']);

        // Vorher-/Nachher-Zustand in Lehrkraft-Deutsch (Ticket #390,
        // Abnahmekriterium 8) - nicht nur der Feldname, auch die Werte.
        $this->assertCount(2, $result['aenderungen']);
        $bygroupmode = array_values(array_filter($result['aenderungen'], fn($c) => $c['feld'] === 'groupmode'))[0];
        $this->assertSame('0', $bygroupmode['von_json']);
        $this->assertSame((string) SEPARATEGROUPS, $bygroupmode['auf_json']);
        $this->assertStringContainsString('groupmode', $result['meldung']);
        $this->assertStringContainsString('groupingid', $result['meldung']);
        $this->assertStringContainsString((string) $grouping->id, $result['meldung']);
    }

    /**
     * idnumber laesst sich setzen (Ticket #390, Abnahmekriterium 5).
     */
    public function test_idnumber_can_be_set(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();
        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance(['course' => $course->id]);

        $result = external_api::clean_returnvalue(
            update_module_settings::execute_returns(),
            update_module_settings::execute($page->cmid, json_encode(['idnumber' => 'kp-390']))
        );

        $this->assertSame('kp-390', $this->read($page->cmid)['idnumber']);

        // Vorher-/Nachher-Zustand in Lehrkraft-Deutsch (Ticket #390,
        // Abnahmekriterium 8).
        $this->assertCount(1, $result['aenderungen']);
        $this->assertSame('idnumber', $result['aenderungen'][0]['feld']);
        $this->assertSame('""', $result['aenderungen'][0]['von_json']);
        $this->assertSame('"kp-390"', $result['aenderungen'][0]['auf_json']);
        $this->assertStringContainsString('kp-390', $result['meldung']);
    }

    /**
     * set_coursemodule_groupmode() (in Moodle 5.2 deprecated) wird nirgends
     * im Plugin verwendet - der Gruppenmodus laeuft ausschliesslich ueber den
     * Formularweg (update_moduleinfo()) (Ticket #390, Abnahmekriterium 4).
     */
    public function test_deprecated_set_coursemodule_groupmode_is_never_used(): void {
        $plugindir = __DIR__ . '/../..';
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($plugindir . '/classes'));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $source = file_get_contents($file->getPathname());
            $this->assertStringNotContainsString(
                'set_coursemodule_groupmode(',
                $source,
                'Gefunden in ' . $file->getPathname()
            );
        }
    }

    /**
     * Abnahmekriterium #399: Drift in einer Aktivitätsart sperrt genau diese
     * fuers Schreiben, mit der Handlungsaufforderung "bitte der
     * Administration melden" - Lesen (get_module_settings) bleibt moeglich.
     */
    public function test_drift_blocks_the_write_but_not_the_read(): void {
        $this->resetAfterTest();
        [$course] = $this->course_with_editing_teacher();

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
        ]);

        \local_kurspilot\write_gate::all_statuses();
        set_config('driftviolations_page', json_encode(['Spalte "intro" fehlt.']), 'local_kurspilot');

        try {
            update_module_settings::execute($page->cmid, json_encode(['name' => 'Neuer Titel']));
            $this->fail('execute() haette wegen Drift werfen muessen.');
        } catch (\moodle_exception $e) {
            // Die genaue deutsche Formulierung ("bitte der Administration
            // melden") wird in write_gate_test.php gegen das Sprachpaket
            // geprueft (Testinstanz hat kein vollstaendiges de-Sprachpaket,
            // nur lang/de/local_kurspilot.php im Plugin) - hier reicht der
            // sprachunabhaengige Fehlercode.
            $this->assertSame('modnamedriftlocked', $e->errorcode);
        }

        // Lesen bleibt trotz Drift moeglich.
        $this->read($page->cmid);
        $this->addToAssertionCount(1);
    }
}
