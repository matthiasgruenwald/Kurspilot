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
}
