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

namespace local_kurspilot;

use local_kurspilot\history\retention;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Aufbewahrung/Loeschfrist des Aenderungsverlaufs (#387, Spec 0015 §10.7):
 * Kurs-Kaskade, Aktivitaets-Kaskade und opportunistische Loeschfrist-
 * Bereinigung ohne alles scannenden Scheduled Task.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(retention::class)]
#[CoversClass(observer::class)]
final class retention_test extends \advanced_testcase {

    /**
     * Legt einen Kurs samt Seiten-Aktivitaet und editierender Lehrkraft an.
     *
     * @return array{0: \stdClass, 1: \stdClass}
     */
    private function create_page(): array {
        $course = $this->getDataGenerator()->create_course();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);

        $page = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
        ]);
        $cm = get_coursemodule_from_instance('page', $page->id, $course->id, false, MUST_EXIST);

        return [$course, $cm];
    }

    /**
     * Abnahmekriterium: die Voreinstellung ist 1 Jahr (365 Tage).
     */
    public function test_default_retention_is_365_days(): void {
        $this->resetAfterTest();
        $this->assertSame(365, retention::days());
        $this->assertSame(365, retention::DEFAULT_DAYS);
    }

    /**
     * Abnahmekriterium: die Frist laesst sich verkuerzen.
     */
    public function test_retention_can_be_shortened_via_setting(): void {
        $this->resetAfterTest();
        set_config('historyretentiondays', 7, 'local_kurspilot');
        $this->assertSame(7, retention::days());
    }

    /**
     * Abnahmekriterium: "keine Frist" ist nicht waehlbar - ein manipulierter
     * oder ungueltiger Rohwert (0, negativ) wird auf mindestens 1 Tag geklemmt.
     */
    public function test_zero_or_negative_raw_value_is_clamped_to_one_day(): void {
        $this->resetAfterTest();

        set_config('historyretentiondays', 0, 'local_kurspilot');
        $this->assertSame(1, retention::days());

        set_config('historyretentiondays', -5, 'local_kurspilot');
        $this->assertSame(1, retention::days());
    }

    /**
     * Abnahmekriterium: ein gelöschter Kurs nimmt seinen Verlauf mit -
     * course_modules ist beim course_deleted-Event bereits weg, die
     * Zuordnung muss also ueber die mitgeschriebene courseid laufen.
     */
    public function test_course_deletion_removes_its_history(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $cm] = $this->create_page();

        $this->assertGreaterThan(0, $DB->count_records('local_kurspilot_cm_version', ['cmid' => $cm->id]));

        delete_course($course, false);

        $this->assertSame(0, (int) $DB->count_records('local_kurspilot_cm_version', ['cmid' => $cm->id]));
        $this->assertSame(0, (int) $DB->count_records('local_kurspilot_cm_version', ['courseid' => $course->id]));
    }

    /**
     * Abnahmekriterium: eine geloeschte Aktivitaet nimmt ihren Verlauf mit,
     * andere Aktivitaeten (auch im selben Kurs) bleiben unberuehrt.
     */
    public function test_activity_deletion_removes_only_its_own_history(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/course/lib.php');
        [$course, $cm] = $this->create_page();

        $otherpage = $this->getDataGenerator()->get_plugin_generator('mod_page')->create_instance([
            'course' => $course->id,
        ]);
        $othercm = get_coursemodule_from_instance('page', $otherpage->id, $course->id, false, MUST_EXIST);

        $versionid = (int) $DB->get_field('local_kurspilot_cm_version', 'id', ['cmid' => $cm->id], MUST_EXIST);

        course_delete_module($cm->id);

        $this->assertSame(0, (int) $DB->count_records('local_kurspilot_cm_version', ['cmid' => $cm->id]));
        $this->assertSame(0, (int) $DB->count_records('local_kurspilot_cm_version_file', ['versionid' => $versionid]));
        $this->assertGreaterThan(0, $DB->count_records('local_kurspilot_cm_version', ['cmid' => $othercm->id]));
    }

    /**
     * Abnahmekriterium: Staende jenseits der Frist werden entfernt, ausgeloest
     * vom naechsten Schreibvorgang derselben cmid - kein Cron. Ein junger
     * Stand (der frisch erzeugte) darf dabei nicht mitgeloescht werden.
     */
    public function test_write_purges_expired_versions_of_same_cm_but_keeps_fresh_one(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/course/modlib.php');
        [$course, $cm] = $this->create_page();

        set_config('historyretentiondays', 1, 'local_kurspilot');

        // Simuliert einen alten Stand jenseits der 1-Tages-Frist.
        $DB->set_field('local_kurspilot_cm_version', 'timecreated', time() - (2 * DAYSECS), [
            'cmid' => $cm->id,
        ]);

        [, , , $moduleinfo] = get_moduleinfo_data($cm, $course);
        $moduleinfo->name = 'Neuer Titel';
        $moduleinfo->page = ['text' => $moduleinfo->content, 'format' => $moduleinfo->contentformat, 'itemid' => 0];
        $moduleinfo->printintro = 0;
        $moduleinfo->printlastmodified = 1;
        update_moduleinfo($cm, $moduleinfo, $course, null);

        $versions = array_values($DB->get_records('local_kurspilot_cm_version', ['cmid' => $cm->id], 'version ASC'));
        $this->assertCount(1, $versions, 'Der alte Stand jenseits der Frist muss weg sein, nur der frische bleibt.');
        $this->assertSame('Neuer Titel', json_decode($versions[0]->moduleinfo_json, true)['name']);
    }

    /**
     * Ein Stand innerhalb der Frist bleibt bei einem weiteren Schreibvorgang
     * unangetastet.
     */
    public function test_write_keeps_versions_within_retention_period(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/course/modlib.php');
        [$course, $cm] = $this->create_page();

        set_config('historyretentiondays', 365, 'local_kurspilot');

        [, , , $moduleinfo] = get_moduleinfo_data($cm, $course);
        $moduleinfo->name = 'Zweiter Stand';
        $moduleinfo->page = ['text' => $moduleinfo->content, 'format' => $moduleinfo->contentformat, 'itemid' => 0];
        $moduleinfo->printintro = 0;
        $moduleinfo->printlastmodified = 1;
        update_moduleinfo($cm, $moduleinfo, $course, null);

        $this->assertCount(2, $DB->get_records('local_kurspilot_cm_version', ['cmid' => $cm->id]));
    }
}
